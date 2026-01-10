import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import { createSeededRandom, hashStringToSeed, randomNormal } from '../random'
import type { SimulationContext, SimulationModule, SimulationSettings, SimHolding } from '../types'
import { toAssetClass, toMonthlyRate, type AssetClass } from './utils'

export const createReturnModule = (
  snapshot: SimulationSnapshot,
  settings: SimulationSettings,
): SimulationModule => {
  const returnModel = snapshot.scenario.strategies.returnModel
  const explain = createExplainTracker()
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
    onEndOfMonth: (state, context) => {
      explain.addInput('Mode', returnModel.mode)
      explain.addInput('Sequence model', returnModel.sequenceModel)
      explain.addInput('Correlation model', returnModel.correlationModel)
      explain.addInput('Volatility scale', returnModel.volatilityScale)
      explain.addInput('Cash yield rate', returnModel.cashYieldRate)
      state.cashAccounts.forEach((account) => {
        const baseRate =
          returnModel.cashYieldRate > 0 ? returnModel.cashYieldRate : account.interestRate
        const rate = toMonthlyRate(baseRate)
        account.balance *= 1 + rate
      })
      state.holdings.forEach((holding) => {
        const expected = toMonthlyRate(holding.returnRate)
        if (returnModel.mode === 'deterministic') {
          holding.balance *= 1 + expected
          return
        }
        const volatility = (holding.returnStdDev * returnModel.volatilityScale) / Math.sqrt(12)
        const shock = getShock(holding, context) * volatility
        const realized = Math.max(-0.95, expected + shock)
        holding.balance *= 1 + realized
      })
    },
    onMarketReturns: (marketReturns) => {
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
      explain.addCheckpoint('Cash return', totals.cash)
      explain.addCheckpoint('Holding return', totals.holdings)
      explain.addCheckpoint('Total return', totals.total)
    },
  }
}
