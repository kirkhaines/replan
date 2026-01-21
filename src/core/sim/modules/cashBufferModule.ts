import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import type {
  ActionIntent,
  CashflowSeriesEntry,
  SimulationContext,
  SimulationModule,
  SimulationState,
} from '../types'
import { getHoldingGain, sumMonthlySpending } from './utils'

const sumSeasonedBasis = (
  entries: SimulationState['holdings'][number]['contributionBasisEntries'],
  dateIso: string,
) => {
  const current = new Date(dateIso)
  if (Number.isNaN(current.getTime())) {
    return 0
  }
  return entries.reduce((sum, entry) => {
    const entryDate = new Date(entry.date)
    if (Number.isNaN(entryDate.getTime())) {
      return sum
    }
    const months =
      (current.getFullYear() - entryDate.getFullYear()) * 12 +
      (current.getMonth() - entryDate.getMonth())
    if (current.getDate() < entryDate.getDate()) {
      return sum
    }
    return months >= 60 ? sum + entry.amount : sum
  }, 0)
}

export const createCashBufferModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const scenario = snapshot.scenario
  const strategy = scenario.strategies.cashBuffer
  const withdrawal = scenario.strategies.withdrawal
  const early = scenario.strategies.earlyRetirement
  const taxableLot = scenario.strategies.taxableLot
  const spendingItems = snapshot.spendingLineItems.filter(
    (item) => item.spendingStrategyId === scenario.spendingStrategyId && !item.isPreTax,
  )
  const explain = createExplainTracker()

  const buildWithdrawalOrder = (state: SimulationState, age: number) => {
    const baseOrder = withdrawal.order
    const penalizedTypes = new Set<string>()
    if (age < 59.5) {
      if (!early.use72t) {
        penalizedTypes.add('traditional')
      }
      penalizedTypes.add('roth')
      penalizedTypes.add('hsa')
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
    context: SimulationContext,
    label: string,
    priorityBase: number,
  ) => {
    if (amount <= 0) {
      return []
    }
    const { order, shouldHarvestGains } = buildWithdrawalOrder(state, context.age)
    const intents: ActionIntent[] = []
    let remaining = amount
    let priority = priorityBase
    const holdingBalances = new Map(state.holdings.map((holding) => [holding.id, holding.balance]))
    const basisRemaining = new Map(
      state.holdings
        .filter((holding) => holding.taxType === 'roth')
        .map((holding) => [
          holding.id,
          sumSeasonedBasis(holding.contributionBasisEntries, context.dateIso),
        ]),
    )

    order.forEach((taxType) => {
      if (remaining <= 0) {
        return
      }
      const isRothBasis = taxType === 'roth_basis'
      const resolvedTaxType = isRothBasis ? 'roth' : taxType
      const holdings = state.holdings.filter((holding) => holding.taxType === resolvedTaxType)
      const sortedHoldings =
        resolvedTaxType === 'taxable'
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
        const balanceRemaining = holdingBalances.get(holding.id) ?? holding.balance
        const basisLimit = isRothBasis ? basisRemaining.get(holding.id) ?? 0 : balanceRemaining
        const withdrawAmount = Math.min(remaining, balanceRemaining, basisLimit)
        if (withdrawAmount <= 0) {
          return
        }
        intents.push({
          id: `cash-buffer-${holding.id}`,
          kind: 'withdraw',
          amount: withdrawAmount,
          sourceHoldingId: holding.id,
          priority,
          label: isRothBasis ? `${label} (roth basis)` : label,
        })
        priority += 1
        remaining -= withdrawAmount
        holdingBalances.set(holding.id, balanceRemaining - withdrawAmount)
        if (holding.taxType === 'roth') {
          const remainingBasis = basisRemaining.get(holding.id) ?? 0
          basisRemaining.set(holding.id, Math.max(0, remainingBasis - withdrawAmount))
        }
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
    explain,
    getCashflowSeries: ({ actions, holdingTaxTypeById }) => {
      let cashDelta = 0
      const investmentByKey: Record<string, number> = {}
      const isRothBasisLabel = (label?: string) =>
        typeof label === 'string' && label.toLowerCase().includes('roth basis')

      actions.forEach((action) => {
        const amount = action.resolvedAmount ?? action.amount
        if (action.kind === 'deposit') {
          if (action.fromCash) {
            cashDelta -= amount
          }
          const taxType = action.targetHoldingId
            ? holdingTaxTypeById.get(action.targetHoldingId)
            : undefined
          if (taxType) {
            investmentByKey[taxType] = (investmentByKey[taxType] ?? 0) + amount
          }
          return
        }
        if (action.kind === 'withdraw' || action.kind === 'rmd') {
          cashDelta += amount
          const taxType = action.sourceHoldingId
            ? holdingTaxTypeById.get(action.sourceHoldingId)
            : undefined
          if (taxType) {
            const key =
              taxType === 'roth' && isRothBasisLabel(action.label)
                ? 'roth_basis'
                : taxType
            investmentByKey[key] = (investmentByKey[key] ?? 0) - amount
          }
        }
      })

      const entries: CashflowSeriesEntry[] = []
      if (cashDelta !== 0) {
        entries.push({
          key: 'cash-buffer:cash',
          label: 'Cash buffer - cash',
          value: cashDelta,
          bucket: 'cash',
        })
      }
      Object.entries(investmentByKey).forEach(([key, value]) => {
        if (!value) {
          return
        }
        const bucket = key === 'roth_basis' ? 'roth' : key
        entries.push({
          key: `cash-buffer:${key}`,
          label: `Cash buffer - ${key.replace('_', ' ')}`,
          value,
          bucket: bucket as CashflowSeriesEntry['bucket'],
        })
      })
      return entries
    },
    getActionIntents: (state: SimulationState, context: SimulationContext) => {
      const cashBalance = state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)
      const monthlySpending = sumMonthlySpending(
        spendingItems,
        scenario,
        context.dateIso,
        context.settings.startDate,
      )
      const bridgeMonths = Math.max(0, early.bridgeCashYears) * 12
      const targetMonths = Math.max(strategy.targetMonths, bridgeMonths)
      const minMonths = withdrawal.useCashFirst ? strategy.minMonths : targetMonths
      const maxMonths = Math.max(strategy.maxMonths, targetMonths)
      const target = monthlySpending * targetMonths
      const min = monthlySpending * minMonths
      const max = monthlySpending * maxMonths
      const refillNeeded = cashBalance < min ? Math.max(0, target - cashBalance) : 0
      const investExcess = cashBalance > max ? Math.max(0, cashBalance - target) : 0
      explain.addInput('Monthly spending', monthlySpending)
      explain.addInput('Cash balance', cashBalance)
      explain.addInput('Target months', targetMonths)
      explain.addInput('Min months', minMonths)
      explain.addInput('Max months', maxMonths)
      explain.addInput('Order', withdrawal.order.join(', '))
      explain.addInput('Avoid penalty', withdrawal.avoidEarlyPenalty)
      explain.addInput('Allow penalty', early.allowPenalty)
      explain.addInput('Age', context.age)
      explain.addCheckpoint('Target', target)
      explain.addCheckpoint('Min', min)
      explain.addCheckpoint('Max', max)
      explain.addCheckpoint('Refill needed', refillNeeded)
      explain.addCheckpoint('Invest excess', investExcess)
      if (monthlySpending <= 0) {
        if (cashBalance >= 0) {
          return []
        }
        return buildWithdrawIntents(state, -cashBalance, context, 'Cover cash deficit', 100)
      }
      if (cashBalance < min) {
        const needed = Math.max(0, target - cashBalance)
        return buildWithdrawIntents(state, needed, context, 'Refill cash buffer', 60)
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
