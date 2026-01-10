import type { SimulationSnapshot } from '../../models'
import type { ActionIntent, SimulationContext, SimulationModule, SimulationState } from '../types'
import { getHoldingGain, sumMonthlySpending } from './utils'

export const createCashBufferModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const scenario = snapshot.scenario
  const strategy = scenario.strategies.cashBuffer
  const withdrawal = scenario.strategies.withdrawal
  const early = scenario.strategies.earlyRetirement
  const taxableLot = scenario.strategies.taxableLot
  const spendingItems = snapshot.spendingLineItems.filter(
    (item) => item.spendingStrategyId === scenario.spendingStrategyId,
  )

  const buildWithdrawalOrder = (state: SimulationState, age: number) => {
    const baseOrder = withdrawal.order
    const penalizedTypes = new Set<string>()
    if (age < 59.5) {
      if (!early.use72t) {
        penalizedTypes.add('traditional')
      }
      if (!early.useRothBasisFirst) {
        penalizedTypes.add('roth')
      }
    }
    let order = baseOrder
    if (withdrawal.avoidEarlyPenalty && age < 59.5) {
      order = [
        ...order.filter((type) => !penalizedTypes.has(type)),
        ...order.filter((type) => penalizedTypes.has(type)),
      ]
    }
    if (!early.allowPenalty && age < 59.5) {
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
    return { order, shouldHarvestGains }
  }

  const buildWithdrawIntents = (
    state: SimulationState,
    amount: number,
    age: number,
    label: string,
    priorityBase: number,
  ) => {
    if (amount <= 0) {
      return []
    }
    const { order, shouldHarvestGains } = buildWithdrawalOrder(state, age)
    const intents: ActionIntent[] = []
    let remaining = amount
    let priority = priorityBase

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
        const withdrawAmount = Math.min(remaining, holding.balance)
        if (withdrawAmount <= 0) {
          return
        }
        intents.push({
          id: `cash-buffer-${holding.id}`,
          kind: 'withdraw',
          amount: withdrawAmount,
          sourceHoldingId: holding.id,
          priority,
          label,
        })
        priority += 1
        remaining -= withdrawAmount
      })
    })

    if (intents.length === 0) {
      intents.push({
        id: 'cash-buffer-deficit',
        kind: 'withdraw',
        amount,
        priority: priorityBase,
        label,
      })
    }

    return intents
  }

  return {
    id: 'cash-buffer',
    getActionIntents: (state: SimulationState, context: SimulationContext) => {
      const cashBalance = state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)
      const monthlySpending = sumMonthlySpending(
        spendingItems,
        scenario,
        context.dateIso,
        context.settings.startDate,
      )
      if (monthlySpending <= 0) {
        if (cashBalance >= 0) {
          return []
        }
        return buildWithdrawIntents(
          state,
          Math.abs(cashBalance),
          context.age,
          'Cover cash deficit',
          100,
        )
      }
      const bridgeMonths = Math.max(0, early.bridgeCashYears) * 12
      const targetMonths = Math.max(strategy.targetMonths, bridgeMonths)
      const minMonths = withdrawal.useCashFirst ? strategy.minMonths : targetMonths
      const maxMonths = Math.max(strategy.maxMonths, targetMonths)
      const target = monthlySpending * targetMonths
      const min = monthlySpending * minMonths
      const max = monthlySpending * maxMonths

      if (cashBalance < min) {
        const needed = Math.max(0, target - cashBalance)
        return buildWithdrawIntents(state, needed, context.age, 'Refill cash buffer', 60)
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
