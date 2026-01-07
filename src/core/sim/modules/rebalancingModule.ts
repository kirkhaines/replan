import type { SimulationSnapshot } from '../../models'
import type { ActionIntent, SimulationContext, SimulationModule, SimHolding } from '../types'
import { interpolateTargets, taxAwareSellPriority, toAssetClass } from './utils'

export const createRebalancingModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const { glidepath, rebalancing } = snapshot.scenario.strategies

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

  return {
    id: 'rebalancing',
    getActionIntents: (state, context) => {
      if (!shouldRebalance(context)) {
        return []
      }
      const key = glidepath.mode === 'year' ? context.yearIndex : context.age
      const target = interpolateTargets(glidepath.targets, key)
      if (!target) {
        return []
      }
      const availableCashRef = {
        value: rebalancing.useContributions
          ? state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)
          : 0,
      }
      let priority = 20
      const nextPriority = () => {
        const current = priority
        priority += 1
        return current
      }

      const targetWeights = {
        equity: target.equity,
        bonds: target.bonds,
        cash: target.cash,
        realEstate: target.realEstate,
        other: target.other,
      }

      const buildActionsForHoldings = (holdings: SimHolding[]): ActionIntent[] => {
        const total = holdings.reduce((sum, holding) => sum + holding.balance, 0)
        if (total <= 0) {
          return []
        }
        const totalsByClass = {
          equity: 0,
          bonds: 0,
          cash: 0,
          realEstate: 0,
          other: 0,
        }
        holdings.forEach((holding) => {
          totalsByClass[toAssetClass(holding)] += holding.balance
        })

        const driftExceeded = (Object.keys(targetWeights) as Array<keyof typeof targetWeights>).some(
          (asset) => {
            const currentWeight = total > 0 ? totalsByClass[asset] / total : 0
            return Math.abs(currentWeight - targetWeights[asset]) > rebalancing.driftThreshold
          },
        )
        if (rebalancing.frequency === 'threshold' && !driftExceeded) {
          return []
        }
        if (!driftExceeded && rebalancing.driftThreshold > 0) {
          return []
        }

        const actions: ActionIntent[] = []
        ;(Object.keys(targetWeights) as Array<keyof typeof targetWeights>).forEach((asset) => {
          const targetAmount = targetWeights[asset] * total
          const currentAmount = totalsByClass[asset]
          const delta = targetAmount - currentAmount
          if (Math.abs(delta) < rebalancing.minTradeAmount) {
            return
          }
          const assetHoldings = holdings.filter((holding) => toAssetClass(holding) === asset)
          if (assetHoldings.length === 0) {
            return
          }
          if (delta < 0) {
            let remaining = Math.abs(delta)
            sortHoldingsForSale(assetHoldings).forEach((holding) => {
              if (remaining <= 0) {
                return
              }
              const amount = Math.min(remaining, holding.balance)
              if (amount <= 0) {
                return
              }
              actions.push({
                id: `rebalance-sell-${holding.id}-${context.monthIndex}`,
                kind: 'withdraw',
                amount,
                sourceHoldingId: holding.id,
                priority: nextPriority(),
                label: 'Rebalance',
              })
              remaining -= amount
            })
          } else if (delta > 0) {
            const amount = rebalancing.useContributions
              ? Math.min(delta, Math.max(0, availableCashRef.value))
              : delta
            if (amount <= 0) {
              return
            }
            const targetHolding = assetHoldings.sort((a, b) => b.balance - a.balance)[0]
            if (!targetHolding) {
              return
            }
            actions.push({
              id: `rebalance-buy-${targetHolding.id}-${context.monthIndex}`,
              kind: 'deposit',
              amount,
              targetHoldingId: targetHolding.id,
              fromCash: true,
              priority: nextPriority(),
              label: 'Rebalance',
            })
            if (rebalancing.useContributions) {
              availableCashRef.value = Math.max(0, availableCashRef.value - amount)
            }
          }
        })
        return actions
      }

      if (glidepath.scope === 'per_account') {
        const actions: ActionIntent[] = []
        const holdingsByAccount = new Map<string, SimHolding[]>()
        state.holdings.forEach((holding) => {
          const list = holdingsByAccount.get(holding.investmentAccountId) ?? []
          list.push(holding)
          holdingsByAccount.set(holding.investmentAccountId, list)
        })
        holdingsByAccount.forEach((holdings) => {
          actions.push(...buildActionsForHoldings(holdings))
        })
        return actions
      }

      return buildActionsForHoldings(state.holdings)
    },
  }
}
