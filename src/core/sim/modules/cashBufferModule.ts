import type { SimulationSnapshot } from '../../models'
import type { ActionIntent, SimulationModule } from '../types'
import { sumMonthlySpending } from './utils'

export const createCashBufferModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const scenario = snapshot.scenario
  const strategy = scenario.strategies.cashBuffer
  const withdrawal = scenario.strategies.withdrawal
  const early = scenario.strategies.earlyRetirement
  const spendingItems = snapshot.spendingLineItems.filter(
    (item) => item.spendingStrategyId === scenario.spendingStrategyId,
  )

  const getWithdrawOrder = () => {
    if (strategy.refillPriority === 'tax_deferred_first') {
      return ['traditional', 'taxable', 'roth', 'hsa'] as const
    }
    if (strategy.refillPriority === 'taxable_first') {
      return ['taxable', 'traditional', 'roth', 'hsa'] as const
    }
    return [] as const
  }

  return {
    id: 'cash-buffer',
    getActionIntents: (state, context) => {
      const monthlySpending = sumMonthlySpending(
        spendingItems,
        scenario,
        context.dateIso,
        context.settings.startDate,
      )
      if (monthlySpending <= 0) {
        return []
      }
      const bridgeMonths = Math.max(0, early.bridgeCashYears) * 12
      const targetMonths = Math.max(strategy.targetMonths, bridgeMonths)
      const minMonths = withdrawal.useCashFirst ? strategy.minMonths : targetMonths
      const maxMonths = Math.max(strategy.maxMonths, targetMonths)
      const target = monthlySpending * targetMonths
      const min = monthlySpending * minMonths
      const max = monthlySpending * maxMonths
      const cashBalance = state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)

      if (cashBalance < min) {
        const needed = Math.max(0, target - cashBalance)
        if (strategy.refillPriority === 'pro_rata') {
          return [
            {
              id: `cash-buffer-${context.monthIndex}`,
              kind: 'withdraw',
              amount: needed,
              priority: 60,
              label: 'Refill cash buffer',
            },
          ]
        }
        const order = getWithdrawOrder()
        const intents: ActionIntent[] = []
        let remaining = needed
        let priority = 60
        order.forEach((taxType) => {
          if (remaining <= 0) {
            return
          }
          const holdings = state.holdings
            .filter((holding) => holding.taxType === taxType)
            .sort((a, b) => b.balance - a.balance)
          holdings.forEach((holding) => {
            if (remaining <= 0) {
              return
            }
            const amount = Math.min(remaining, holding.balance)
            if (amount <= 0) {
              return
            }
            intents.push({
              id: `cash-buffer-${holding.id}`,
              kind: 'withdraw',
              amount,
              sourceHoldingId: holding.id,
              priority,
              label: 'Refill cash buffer',
            })
            priority += 1
            remaining -= amount
          })
        })
        return intents
      }

      if (cashBalance > max) {
        const excess = Math.max(0, cashBalance - target)
        const targetHolding = [...state.holdings].sort((a, b) => b.balance - a.balance)[0]
        if (!targetHolding) {
          return []
        }
        return [
          {
            id: `cash-buffer-invest-${context.monthIndex}`,
            kind: 'deposit',
            amount: excess,
            targetHoldingId: targetHolding.id,
            fromCash: true,
            priority: 70,
            label: 'Invest excess cash',
          },
        ]
      }

      return []
    },
  }
}
