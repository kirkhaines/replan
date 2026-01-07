import type { SimulationSnapshot } from '../../models'
import type { ActionIntent, SimulationModule } from '../types'
import { getHoldingGain } from './utils'

export const createFundingModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const scenario = snapshot.scenario
  const withdrawal = scenario.strategies.withdrawal
  const early = scenario.strategies.earlyRetirement
  const taxableLot = scenario.strategies.taxableLot

  return {
    id: 'funding-core',
    getActionIntents: (state, context) => {
      const cashBalance = state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)
      if (cashBalance >= 0) {
        return []
      }
      const deficit = Math.abs(cashBalance)

      const baseOrder = withdrawal.order
      const penalizedTypes = new Set<string>()
      if (context.age < 59.5) {
        if (!early.use72t) {
          penalizedTypes.add('traditional')
        }
        if (!early.useRothBasisFirst) {
          penalizedTypes.add('roth')
        }
      }
      let order = baseOrder
      if (withdrawal.avoidEarlyPenalty && context.age < 59.5) {
        order = [
          ...order.filter((type) => !penalizedTypes.has(type)),
          ...order.filter((type) => penalizedTypes.has(type)),
        ]
      }
      if (!early.allowPenalty && context.age < 59.5) {
        const withoutPenalty = order.filter((type) => !penalizedTypes.has(type))
        if (withoutPenalty.length > 0) {
          order = withoutPenalty
        }
      }
      const gainTarget = Math.max(
        withdrawal.taxableGainHarvestTarget,
        taxableLot.gainRealizationTarget,
      )
      const shouldHarvestGains = gainTarget > 0 && state.yearLedger.capitalGains < gainTarget
      if (shouldHarvestGains && order.includes('taxable')) {
        order = ['taxable', ...order.filter((type) => type !== 'taxable')]
      }
      const intents: ActionIntent[] = []
      let remaining = deficit
      let priority = 100

      order.forEach((taxType) => {
        if (remaining <= 0) {
          return
        }
        const holdings = state.holdings.filter((holding) => holding.taxType === taxType)
        const sortedHoldings =
          taxType === 'taxable'
            ? [...holdings].sort((a, b) => {
                const gainDelta = getHoldingGain(b) - getHoldingGain(a)
                if (shouldHarvestGains) {
                  return gainDelta
                }
                if (taxableLot.harvestLosses) {
                  return -gainDelta
                }
                return b.balance - a.balance
              })
            : [...holdings].sort((a, b) => b.balance - a.balance)
        sortedHoldings.forEach((holding) => {
          if (remaining <= 0) {
            return
          }
          const amount = Math.min(remaining, holding.balance)
          if (amount <= 0) {
            return
          }
          intents.push({
            id: `funding-${holding.id}`,
            kind: 'withdraw',
            amount,
            sourceHoldingId: holding.id,
            priority,
            label: 'Cover cash deficit',
          })
          priority += 1
          remaining -= amount
        })
      })

      if (intents.length === 0) {
        intents.push({
          id: 'funding-cash-deficit',
          kind: 'withdraw',
          amount: deficit,
          priority: 100,
          label: 'Cover cash deficit',
        })
      }

      return intents
    },
  }
}
