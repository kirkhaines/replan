import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import { createSeededRandom, hashStringToSeed, randomNormal } from '../random'
import type { SimulationContext, SimulationModule, SimulationSettings, SimHolding } from '../types'
import { toAssetClass, toMonthlyRate, type AssetClass } from './utils'

const toMarketAssetClass = (holdingType?: string | null): AssetClass => {
  switch (holdingType) {
    case 'bonds':
      return 'bonds'
    case 'cash':
      return 'cash'
    case 'real_estate':
      return 'realEstate'
    case 'other':
      return 'other'
    default:
      return 'equity'
  }
}

export const createReturnModule = (
  snapshot: SimulationSnapshot,
  settings: SimulationSettings,
): SimulationModule => {
  const returnModel = snapshot.scenario.strategies.returnModel
  const glidepath = snapshot.scenario.strategies.glidepath
  const explain = createExplainTracker(!settings.summaryOnly)
  const seed =
    returnModel.seed ?? hashStringToSeed(`${snapshot.scenario.id}:${settings.startDate}`)
  const random = createSeededRandom(seed)
  let cachedMonth = -1
  let cachedYear = -1
  let monthShocksByAsset: Partial<Record<AssetClass, number>> = {}
  let yearShocksByAsset: Partial<Record<AssetClass, number>> = {}
  let yearShocksByHolding: Record<string, number> = {}

  const nextNormalShock = () => randomNormal(random)

  const getShock = (holding: SimHolding, context: SimulationContext) => {
    if (returnModel.sequenceModel === 'regime') {
      if (context.yearIndex !== cachedYear) {
        cachedYear = context.yearIndex
        yearShocksByAsset = {}
        yearShocksByHolding = {}
      }
      if (returnModel.correlationModel === 'asset_class') {
        const asset = toAssetClass(holding)
        if (yearShocksByAsset[asset] === undefined) {
          yearShocksByAsset[asset] = nextNormalShock()
        }
        return yearShocksByAsset[asset] ?? 0
      }
      if (yearShocksByHolding[holding.id] === undefined) {
        yearShocksByHolding[holding.id] = nextNormalShock()
      }
      return yearShocksByHolding[holding.id]
    }

    if (returnModel.correlationModel === 'asset_class') {
      if (context.monthIndex !== cachedMonth) {
        cachedMonth = context.monthIndex
        monthShocksByAsset = {}
      }
      const asset = toAssetClass(holding)
      if (monthShocksByAsset[asset] === undefined) {
        monthShocksByAsset[asset] = nextNormalShock()
      }
      return monthShocksByAsset[asset] ?? 0
    }

    return nextNormalShock()
  }

  return {
    id: 'returns-core',
    explain,
    getCashflowSeries: ({ marketReturns }) => {
      if (!marketReturns || marketReturns.length === 0) {
        return []
      }
      const totals: Record<'cash' | 'taxable' | 'traditional' | 'roth' | 'hsa', number> = {
        cash: 0,
        taxable: 0,
        traditional: 0,
        roth: 0,
        hsa: 0,
      }
      marketReturns.forEach((entry) => {
        if (entry.kind === 'cash') {
          totals.cash += entry.amount
          return
        }
        const rawTaxType = entry.taxType ?? 'taxable'
        const taxType =
          rawTaxType === 'taxable' ||
          rawTaxType === 'traditional' ||
          rawTaxType === 'roth' ||
          rawTaxType === 'hsa'
            ? rawTaxType
            : 'taxable'
        totals[taxType] += entry.amount
      })
      return (Object.entries(totals) as Array<[keyof typeof totals, number]>)
        .filter(([, value]) => value !== 0)
        .map(([bucket, value]) => ({
          key: `returns-core:${bucket}`,
          label: `Market returns - ${bucket}`,
          value,
          bucket,
        }))
    },
    onEndOfMonth: (state, context) => {
      explain.addInput('Mode', returnModel.mode)
      explain.addInput('Shock period', returnModel.sequenceModel)
      explain.addInput('Shock correlation', returnModel.correlationModel)
      explain.addInput('Volatility scale', returnModel.volatilityScale)
      state.cashAccounts.forEach((account) => {
        const rate = toMonthlyRate(account.interestRate)
        account.balance *= 1 + rate
      })
      state.holdings.forEach((holding) => {
        const expected = toMonthlyRate(holding.returnRate)
        if (returnModel.mode === 'deterministic') {
          holding.balance *= 1 + expected
          return
        }
        const annualVolatility = holding.returnStdDev * returnModel.volatilityScale
        // If the same shock is reused for each month in a calendar year, scale by 12 to
        // preserve the annual variance; otherwise scale by sqrt(12) for iid monthly shocks.
        const volatility =
          annualVolatility /
          (returnModel.sequenceModel === 'regime' ? 12 : Math.sqrt(12))
        const shock = getShock(holding, context) * volatility
        const realized = Math.max(-0.95, expected + shock)
        holding.balance *= 1 + realized
      })
    },
    onMarketReturns: (marketReturns, state) => {
      const totals = marketReturns.reduce(
        (sum, entry) => {
          if (entry.kind === 'cash') {
            sum.cash += entry.amount
          } else {
            sum.holdings += entry.amount
          }
          sum.total += entry.amount
          return sum
        },
        { cash: 0, holdings: 0, total: 0 },
      )
      const equityTotals = marketReturns.reduce(
        (sum, entry) => {
          if (entry.kind !== 'holding') {
            return sum
          }
          if (toMarketAssetClass(entry.holdingType) !== 'equity') {
            return sum
          }
          sum.start += entry.balanceStart
          sum.amount += entry.amount
          return sum
        },
        { start: 0, amount: 0 },
      )
      const equityRate =
        equityTotals.start > 0 ? equityTotals.amount / equityTotals.start : 0
      const signal = state.marketDownturn ?? {
        equityMarketValue: 1,
        equityMarketHigh: 1,
        downturnHighBeforeDrop: null,
        inDownturn: false,
        inRecovery: false,
        pendingRecoveryBaseCapture: false,
        recoveryBaseBondFraction: null,
        recoveryBaseMarketValue: null,
      }
      signal.equityMarketValue *= 1 + equityRate
      if (signal.equityMarketValue > signal.equityMarketHigh) {
        signal.equityMarketHigh = signal.equityMarketValue
      }
      if (glidepath.sellBondsFirstInDownMarkets) {
        const threshold = glidepath.sellBondsBelowHighThreshold
        const thresholdValue = signal.equityMarketHigh * threshold
        const nowInDownturn = signal.equityMarketValue < thresholdValue
        if (!signal.inDownturn && nowInDownturn) {
          signal.inDownturn = true
          signal.inRecovery = false
          signal.pendingRecoveryBaseCapture = false
          signal.recoveryBaseBondFraction = null
          signal.recoveryBaseMarketValue = null
          signal.downturnHighBeforeDrop = signal.equityMarketHigh
        } else if (signal.inDownturn && !nowInDownturn) {
          const highBeforeDrop = signal.downturnHighBeforeDrop ?? signal.equityMarketHigh
          signal.inDownturn = false
          signal.inRecovery = true
          signal.pendingRecoveryBaseCapture = true
          signal.recoveryBaseBondFraction = null
          signal.recoveryBaseMarketValue = highBeforeDrop * threshold
          signal.downturnHighBeforeDrop = null
        } else if (!nowInDownturn && !signal.inRecovery) {
          signal.downturnHighBeforeDrop = null
        }
      } else {
        signal.inDownturn = false
        signal.inRecovery = false
        signal.pendingRecoveryBaseCapture = false
        signal.recoveryBaseBondFraction = null
        signal.recoveryBaseMarketValue = null
        signal.downturnHighBeforeDrop = null
      }
      state.marketDownturn = signal
      explain.addCheckpoint('Cash return', totals.cash)
      explain.addCheckpoint('Holding return', totals.holdings)
      explain.addCheckpoint('Total return', totals.total)
      explain.addCheckpoint('Equity market value', signal.equityMarketValue)
      explain.addCheckpoint('Equity market high', signal.equityMarketHigh)
      explain.addCheckpoint('Downturn period', signal.inDownturn)
      explain.addCheckpoint('Recovery period', signal.inRecovery)
    },
  }
}
