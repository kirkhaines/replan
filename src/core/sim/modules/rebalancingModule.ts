import type { SimulationSnapshot } from '../../models'
import { holdingTypeDefaultsSeed } from '../../defaults/defaultData'
import { createUuid } from '../../utils/uuid'
import { createExplainTracker } from '../explain'
import type {
  ActionIntent,
  SimulationContext,
  SimulationModule,
  SimulationSettings,
  SimHolding,
} from '../types'
import {
  buildActionCashflowSeries,
  interpolateTargets,
  taxAwareSellPriority,
  toAssetClass,
} from './utils'

const nonCashAssets = ['equity', 'bonds', 'realEstate', 'other'] as const
type NonCashAsset = (typeof nonCashAssets)[number]
type TargetWeights = Record<NonCashAsset, number>

const assetHoldingType: Record<NonCashAsset, SimHolding['holdingType']> = {
  equity: 'sp500',
  bonds: 'bonds',
  realEstate: 'real_estate',
  other: 'other',
}

const holdingTypeLabels: Record<SimHolding['holdingType'], string> = {
  bonds: 'Bonds',
  sp500: 'S&P 500',
  nasdaq: 'Nasdaq',
  dow: 'Dow',
  non_us_developed: 'Non-US developed',
  emerging_markets: 'Emerging markets',
  real_estate: 'Real estate',
  cash: 'Cash',
  other: 'Other',
}

const taxTypeRank: Record<SimHolding['taxType'], number> = {
  traditional: 0,
  roth: 1,
  hsa: 2,
  taxable: 3,
}

const holdingTypeDefaultsByType = new Map(
  holdingTypeDefaultsSeed.map((seed) => [seed.type, seed]),
)

const emptyTotals = (): TargetWeights => ({
  equity: 0,
  bonds: 0,
  realEstate: 0,
  other: 0,
})

const getNonCashAsset = (holding: SimHolding): NonCashAsset | null => {
  const asset = toAssetClass(holding)
  if (asset === 'cash') {
    return null
  }
  return asset
}

const normalizeWeights = (weights: TargetWeights): TargetWeights | null => {
  const sum =
    weights.equity + weights.bonds + weights.realEstate + weights.other
  if (sum <= 0) {
    return null
  }
  return {
    equity: weights.equity / sum,
    bonds: weights.bonds / sum,
    realEstate: weights.realEstate / sum,
    other: weights.other / sum,
  }
}

const computeWeightsFromHoldings = (holdings: SimHolding[]): TargetWeights | null => {
  const totals = emptyTotals()
  let totalBalance = 0
  holdings.forEach((holding) => {
    const asset = getNonCashAsset(holding)
    if (!asset) {
      return
    }
    totals[asset] += holding.balance
    totalBalance += holding.balance
  })
  if (totalBalance <= 0) {
    return null
  }
  return {
    equity: totals.equity / totalBalance,
    bonds: totals.bonds / totalBalance,
    realEstate: totals.realEstate / totalBalance,
    other: totals.other / totalBalance,
  }
}

const formatTargetWeights = (target: TargetWeights | null) => {
  if (!target) {
    return 'none'
  }
  return [
    `equity ${(target.equity * 100).toFixed(1)}%`,
    `bonds ${(target.bonds * 100).toFixed(1)}%`,
    `realEstate ${(target.realEstate * 100).toFixed(1)}%`,
    `other ${(target.other * 100).toFixed(1)}%`,
  ].join(', ')
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const withBondTargetLimit = (target: TargetWeights, bondLimit: number): TargetWeights => {
  const bond = clamp01(bondLimit)
  const remaining = Math.max(0, 1 - bond)
  const nonBondTotal = target.equity + target.realEstate + target.other
  if (nonBondTotal <= 0) {
    return { ...target, bonds: bond }
  }
  const scale = remaining / nonBondTotal
  return {
    equity: target.equity * scale,
    bonds: bond,
    realEstate: target.realEstate * scale,
    other: target.other * scale,
  }
}

export const createRebalancingModule = (
  snapshot: SimulationSnapshot,
  settings?: SimulationSettings,
): SimulationModule => {
  const { glidepath, rebalancing } = snapshot.scenario.strategies
  const explain = createExplainTracker(!settings?.summaryOnly)
  let baselineTarget: TargetWeights | null = null
  const createdHoldingIds = new Map<string, string>()

  const shouldRebalance = (context: SimulationContext) => {
    if (rebalancing.frequency === 'monthly') {
      return true
    }
    if (rebalancing.frequency === 'quarterly') {
      return context.monthIndex % 3 === 2
    }
    if (rebalancing.frequency === 'annual') {
      return context.isEndOfYear
    }
    return true
  }

  const sortHoldingsForSale = (holdings: SimHolding[]) => {
    const sorted = [...holdings]
    if (rebalancing.taxAware) {
      sorted.sort((a, b) => {
        const priority = taxAwareSellPriority[a.taxType] - taxAwareSellPriority[b.taxType]
        return priority !== 0 ? priority : b.balance - a.balance
      })
      return sorted
    }
    return sorted.sort((a, b) => b.balance - a.balance)
  }

  const resolveTargetWeights = (
    holdings: SimHolding[],
    context: SimulationContext,
  ): TargetWeights | null => {
    if (glidepath.targets.length > 0) {
      const key = glidepath.mode === 'year' ? context.yearIndex : context.age
      const target = interpolateTargets(glidepath.targets, key)
      if (!target) {
        return null
      }
      return normalizeWeights({
        equity: target.equity,
        bonds: target.bonds,
        realEstate: target.realEstate,
        other: target.other,
      })
    }
    if (!baselineTarget) {
      baselineTarget = computeWeightsFromHoldings(holdings)
    }
    return baselineTarget
  }

  const getAccountRank = (holdings: SimHolding[]) => {
    if (holdings.length === 0) {
      return taxTypeRank.taxable
    }
    return holdings.reduce(
      (rank, holding) => Math.min(rank, taxTypeRank[holding.taxType]),
      taxTypeRank.taxable,
    )
  }

  return {
    id: 'rebalancing',
    explain,
    getCashflowSeries: ({ actions, holdingTaxTypeById }) =>
      buildActionCashflowSeries({
        moduleId: 'rebalancing',
        moduleLabel: 'Rebalancing',
        actions,
        holdingTaxTypeById,
      }),
    getActionIntents: (state, context) => {
      const nonCashHoldings = state.holdings.filter((holding) => getNonCashAsset(holding))
      const targetWeights = resolveTargetWeights(nonCashHoldings, context)
      const signal = state.marketDownturn
      const downturnModeEnabled = glidepath.sellBondsFirstInDownMarkets
      const inDownturn = downturnModeEnabled && Boolean(signal?.inDownturn)
      let inRecovery = downturnModeEnabled && Boolean(signal?.inRecovery)

      if (downturnModeEnabled && signal?.pendingRecoveryBaseCapture) {
        const totals = emptyTotals()
        let nonCashTotal = 0
        nonCashHoldings.forEach((holding) => {
          const asset = getNonCashAsset(holding)
          if (!asset) {
            return
          }
          totals[asset] += holding.balance
          nonCashTotal += holding.balance
        })
        signal.recoveryBaseBondFraction =
          nonCashTotal > 0 ? totals.bonds / nonCashTotal : 0
        signal.pendingRecoveryBaseCapture = false
      }

      let adjustedTargetWeights = targetWeights
      if (adjustedTargetWeights && downturnModeEnabled) {
        if (inDownturn) {
          adjustedTargetWeights = withBondTargetLimit(adjustedTargetWeights, 0)
        } else if (inRecovery && signal) {
          const marketValue = signal.equityMarketValue
          const recoveryBaseMarketValue = signal.recoveryBaseMarketValue
          const recoveryBaseBondFraction = signal.recoveryBaseBondFraction
          if (
            marketValue > 0 &&
            recoveryBaseMarketValue !== null &&
            recoveryBaseBondFraction !== null
          ) {
            const recoveryLimit = clamp01(
              recoveryBaseBondFraction +
                (marketValue - recoveryBaseMarketValue) / marketValue,
            )
            if (recoveryLimit >= adjustedTargetWeights.bonds) {
              signal.inRecovery = false
              signal.recoveryBaseBondFraction = null
              signal.recoveryBaseMarketValue = null
              inRecovery = false
            } else {
              adjustedTargetWeights = withBondTargetLimit(
                adjustedTargetWeights,
                recoveryLimit,
              )
            }
          }
        }
      }

      const activeAssets: NonCashAsset[] = inDownturn
        ? nonCashAssets.filter((asset) => asset !== 'bonds')
        : [...nonCashAssets]
      const targetLabel = formatTargetWeights(adjustedTargetWeights)

      const canRebalance = shouldRebalance(context)
      if (!canRebalance) {
        explain.addInput('Frequency', rebalancing.frequency)
        explain.addInput('Tax aware', rebalancing.taxAware)
        explain.addInput('Use contributions', rebalancing.useContributions)
        explain.addInput('Drift threshold', rebalancing.driftThreshold)
        explain.addInput('Min trade', rebalancing.minTradeAmount)
        explain.addCheckpoint('Should rebalance', false)
        explain.addCheckpoint('Target weights', targetLabel)
        explain.addCheckpoint('Trades', 0)
        return []
      }

      if (!adjustedTargetWeights) {
        explain.addInput('Frequency', rebalancing.frequency)
        explain.addInput('Tax aware', rebalancing.taxAware)
        explain.addInput('Use contributions', rebalancing.useContributions)
        explain.addInput('Drift threshold', rebalancing.driftThreshold)
        explain.addInput('Min trade', rebalancing.minTradeAmount)
        explain.addCheckpoint('Should rebalance', true)
        explain.addCheckpoint('Target weights', 'none')
        explain.addCheckpoint('Trades', 0)
        return []
      }

      const totalsByAsset = emptyTotals()
      let totalBalance = 0
      nonCashHoldings.forEach((holding) => {
        const asset = getNonCashAsset(holding)
        if (!asset || !activeAssets.includes(asset)) {
          return
        }
        totalsByAsset[asset] += holding.balance
        totalBalance += holding.balance
      })

      if (totalBalance <= 0) {
        explain.addInput('Frequency', rebalancing.frequency)
        explain.addInput('Tax aware', rebalancing.taxAware)
        explain.addInput('Use contributions', rebalancing.useContributions)
        explain.addInput('Drift threshold', rebalancing.driftThreshold)
        explain.addInput('Min trade', rebalancing.minTradeAmount)
        explain.addCheckpoint('Should rebalance', true)
        explain.addCheckpoint('Target weights', targetLabel)
        explain.addCheckpoint('Trades', 0)
        return []
      }

      const driftExceeded = activeAssets.some((asset) => {
        const currentWeight = totalsByAsset[asset] / totalBalance
        return Math.abs(currentWeight - adjustedTargetWeights[asset]) > rebalancing.driftThreshold
      })
      if (rebalancing.frequency === 'threshold' && !driftExceeded) {
        return []
      }
      if (!driftExceeded && rebalancing.driftThreshold > 0) {
        return []
      }

      const buyRemaining: TargetWeights = emptyTotals()
      const sellRemaining: TargetWeights = emptyTotals()
      activeAssets.forEach((asset) => {
        const targetAmount = adjustedTargetWeights[asset] * totalBalance
        const currentAmount = totalsByAsset[asset]
        const delta = targetAmount - currentAmount
        if (Math.abs(delta) < rebalancing.minTradeAmount) {
          return
        }
        if (delta > 0) {
          buyRemaining[asset] = delta
        } else if (delta < 0) {
          sellRemaining[asset] = -delta
        }
      })

      const totalBuys = activeAssets.reduce((sum, asset) => sum + buyRemaining[asset], 0)
      const totalSells = activeAssets.reduce((sum, asset) => sum + sellRemaining[asset], 0)
      if (totalBuys <= 0 || totalSells <= 0) {
        return []
      }

      const referenceByAsset = new Map<NonCashAsset, SimHolding>()
      nonCashHoldings.forEach((holding) => {
        const asset = getNonCashAsset(holding)
        if (!asset || !activeAssets.includes(asset) || referenceByAsset.has(asset)) {
          return
        }
        referenceByAsset.set(asset, holding)
      })

      const holdingsByAccount = new Map<string, SimHolding[]>()
      nonCashHoldings.forEach((holding) => {
        const asset = getNonCashAsset(holding)
        if (!asset || !activeAssets.includes(asset)) {
          return
        }
        const list = holdingsByAccount.get(holding.investmentAccountId) ?? []
        list.push(holding)
        holdingsByAccount.set(holding.investmentAccountId, list)
      })

      const accountList = [...holdingsByAccount.entries()]
        .map(([accountId, holdings]) => ({
          accountId,
          holdings,
          rank: getAccountRank(holdings),
          balance: holdings.reduce((sum, holding) => sum + holding.balance, 0),
        }))
        .sort((a, b) => a.rank - b.rank || b.balance - a.balance)

      const ensureHoldingForAsset = (
        accountId: string,
        asset: NonCashAsset,
        holdings: SimHolding[],
        taxType: SimHolding['taxType'],
      ) => {
        const existing = holdings.find(
          (holding) => getNonCashAsset(holding) === asset && holding.taxType === taxType,
        )
        if (existing) {
          return existing
        }
        const key = `${accountId}:${asset}:${taxType}`
        const existingId = createdHoldingIds.get(key)
        const reference = referenceByAsset.get(asset)
        const holdingType = reference?.holdingType ?? assetHoldingType[asset]
        const name = reference?.name ?? holdingTypeLabels[holdingType]
        const defaults = holdingTypeDefaultsByType.get(holdingType)
        const returnRate = reference?.returnRate ?? defaults?.returnRate ?? 0
        const returnStdDev = reference?.returnStdDev ?? defaults?.returnStdDev ?? 0
        const taxableDistributionYield = reference?.taxableDistributionYield ?? 0
        const holding = {
          id: existingId ?? createUuid(),
          name,
          investmentAccountId: accountId,
          taxType,
          holdingType,
          balance: 0,
          costBasisEntries: [],
          returnRate,
          returnStdDev,
          taxableDistributionYield,
        }
        createdHoldingIds.set(key, holding.id)
        state.holdings.push(holding)
        holdings.push(holding)
        return holding
      }

      const pickNextBuyAsset = (): NonCashAsset | null => {
        let candidate: NonCashAsset | null = null
        let best = 0
        activeAssets.forEach((asset) => {
          const remaining = buyRemaining[asset]
          if (remaining > best) {
            best = remaining
            candidate = asset
          }
        })
        return candidate
      }

      let priority = 20
      const nextPriority = () => {
        const current = priority
        priority += 1
        return current
      }

      const actions: ActionIntent[] = []
      accountList.forEach(({ accountId, holdings }) => {
        if (activeAssets.every((asset) => sellRemaining[asset] <= 0)) {
          return
        }
        if (activeAssets.every((asset) => buyRemaining[asset] <= 0)) {
          return
        }
        const holdingsByAsset = new Map<NonCashAsset, SimHolding[]>()
        activeAssets.forEach((asset) => holdingsByAsset.set(asset, []))
        holdings.forEach((holding) => {
          const asset = getNonCashAsset(holding)
          if (!asset || !activeAssets.includes(asset)) {
            return
          }
          holdingsByAsset.get(asset)?.push(holding)
        })

        activeAssets.forEach((asset) => {
          if (sellRemaining[asset] <= 0) {
            return
          }
          const saleHoldings = sortHoldingsForSale(holdingsByAsset.get(asset) ?? [])
          saleHoldings.forEach((holding) => {
            let remaining = Math.min(holding.balance, sellRemaining[asset])
            while (remaining > 0) {
              const buyAsset = pickNextBuyAsset()
              if (buyAsset === null) {
                return
              }
              const buyHolding = ensureHoldingForAsset(
                accountId,
                buyAsset,
                holdings,
                holding.taxType,
              )
              const buyAmountRemaining = buyRemaining[buyAsset]
              const amount = Math.min(remaining, buyAmountRemaining)
              if (amount <= 0) {
                return
              }
              actions.push({
                id: `rebalance-${holding.id}-${buyHolding.id}-${context.monthIndex}`,
                kind: 'rebalance',
                amount,
                sourceHoldingId: holding.id,
                targetHoldingId: buyHolding.id,
                priority: nextPriority(),
                label: 'Rebalance',
              })
              remaining -= amount
              sellRemaining[asset] = Math.max(0, sellRemaining[asset] - amount)
              buyRemaining[buyAsset] = Math.max(0, buyAmountRemaining - amount)
            }
          })
        })
      })

      explain.addInput('Frequency', rebalancing.frequency)
      explain.addInput('Tax aware', rebalancing.taxAware)
      explain.addInput('Use contributions', rebalancing.useContributions)
      explain.addInput('Drift threshold', rebalancing.driftThreshold)
      explain.addInput('Min trade', rebalancing.minTradeAmount)
      explain.addCheckpoint('Should rebalance', true)
      explain.addCheckpoint('Target weights', targetLabel)
      explain.addCheckpoint('Trades', actions.length)
      return actions
    },
  }
}
