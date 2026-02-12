import type { ScenarioStrategies, SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import type {
  ActionIntent,
  CashflowSeriesEntry,
  SimulationContext,
  SimulationModule,
  SimulationSettings,
  SimulationState,
} from '../types'
import { applyInflation } from '../../utils/inflation'
import { getYearFromIsoDate, monthsBetweenIsoDates } from '../../utils/date'
import { getHoldingGain, sumMonthlySpending } from './utils'

const sumSeasonedContributions = (
  entries: SimulationState['investmentAccounts'][number]['contributionEntries'],
  dateIso: string,
  taxType: SimulationState['holdings'][number]['taxType'],
) => {
  const filtered = entries.filter((entry) => entry.taxType === taxType)
  return filtered.reduce((sum, entry) => {
    const months = monthsBetweenIsoDates(entry.date, dateIso)
    return months >= 60 ? sum + entry.amount : sum
  }, 0)
}

const buildWithdrawalOrderForStrategy = (
  state: SimulationState,
  age: number,
  strategy: Pick<ScenarioStrategies, 'withdrawal' | 'earlyRetirement' | 'taxableLot'>,
) => {
  const { withdrawal, earlyRetirement: early, taxableLot } = strategy
  const baseOrder = withdrawal.order
  let order = baseOrder
  if (age < 59.5) {
    const penalizedTypes = new Set<string>()
    if (!early.use72t) {
      penalizedTypes.add('traditional')
    }
    penalizedTypes.add('roth')
    penalizedTypes.add('hsa')
    if (!early.allowPenalty) {
      const withoutPenalty = order.filter((type) => !penalizedTypes.has(type))
      if (withoutPenalty.length > 0) {
        order = withoutPenalty
      }
    } else if (withdrawal.avoidEarlyPenalty) {
      order = [
        ...order.filter((type) => !penalizedTypes.has(type)),
        ...order.filter((type) => penalizedTypes.has(type)),
      ]
    }
  } else {
    const withoutPenalty = order.filter((type) => type !== 'roth_basis')
    if (withoutPenalty.length > 0) {
      order = withoutPenalty
    }
  }
  const gainTarget = Math.max(withdrawal.taxableGainHarvestTarget, taxableLot.gainRealizationTarget)
  const shouldHarvestGains = gainTarget > 0 && state.yearLedger.capitalGains < gainTarget
  if (shouldHarvestGains && order.includes('taxable')) {
    order = ['taxable', ...order.filter((type) => type !== 'taxable')]
  }
  return { order, shouldHarvestGains }
}

export type CashBufferWithdrawalEstimate = {
  total: number
  byTaxType: Record<string, number>
}

export const estimateCashBufferWithdrawals = (
  snapshot: SimulationSnapshot,
  state: SimulationState,
  context: SimulationContext,
  amount: number,
): CashBufferWithdrawalEstimate => {
  if (amount <= 0) {
    return { total: 0, byTaxType: {} }
  }
  const { withdrawal, earlyRetirement, taxableLot } = snapshot.scenario.strategies
  const { order, shouldHarvestGains } = buildWithdrawalOrderForStrategy(state, context.age, {
    withdrawal,
    earlyRetirement,
    taxableLot,
  })
  const holdingBalances = new Map(state.holdings.map((holding) => [holding.id, holding.balance]))
  const basisRemaining = new Map(
    state.investmentAccounts.map((account) => [
      account.id,
      sumSeasonedContributions(account.contributionEntries, context.dateIso, 'roth'),
    ]),
  )
  const byTaxType: Record<string, number> = {}
  let remaining = amount

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
      const basisLimit = isRothBasis
        ? basisRemaining.get(holding.investmentAccountId) ?? 0
        : balanceRemaining
      const withdrawAmount = Math.min(remaining, balanceRemaining, basisLimit)
      if (withdrawAmount <= 0) {
        return
      }
      byTaxType[taxType] = (byTaxType[taxType] ?? 0) + withdrawAmount
      remaining -= withdrawAmount
      holdingBalances.set(holding.id, balanceRemaining - withdrawAmount)
      if (holding.taxType === 'roth') {
        const remainingBasis = basisRemaining.get(holding.investmentAccountId) ?? 0
        basisRemaining.set(
          holding.investmentAccountId,
          Math.max(0, remainingBasis - withdrawAmount),
        )
      }
    })
  })

  return { total: amount - remaining, byTaxType }
}

export const createCashBufferModule = (
  snapshot: SimulationSnapshot,
  settings?: SimulationSettings,
): SimulationModule => {
  const scenario = snapshot.scenario
  const strategy = scenario.strategies.cashBuffer
  const withdrawal = scenario.strategies.withdrawal
  const early = scenario.strategies.earlyRetirement
  const taxableLot = scenario.strategies.taxableLot
  const contributionLimits = snapshot.contributionLimits ?? []
  const spendingItems = snapshot.spendingLineItems.filter(
    (item) => item.spendingStrategyId === scenario.spendingStrategyId && !item.isPreTax,
  )
  const explain = createExplainTracker(!settings?.summaryOnly)

  const getContributionLimit = (
    type: (typeof contributionLimits)[number]['type'],
    context: SimulationContext,
  ) => {
    if (contributionLimits.length === 0) {
      return 0
    }
    const year = getYearFromIsoDate(context.dateIso) ?? 0
    const sorted = [...contributionLimits]
      .filter((limit) => limit.type === type)
      .sort((a, b) => b.year - a.year)
    if (sorted.length === 0) {
      return 0
    }
    const base = sorted.find((limit) => limit.year <= year) ?? sorted[0]
    const baseIso = `${base.year}-01-01`
    return applyInflation({
      amount: base.amount,
      inflationType: 'cpi',
      fromDateIso: baseIso,
      toDateIso: context.dateIso,
      scenario,
      indexByType: context.inflationIndexByType,
      indexStartDateIso: context.inflationIndexStartDateIso,
    })
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
    const { order, shouldHarvestGains } = buildWithdrawalOrderForStrategy(state, context.age, {
      withdrawal,
      earlyRetirement: early,
      taxableLot,
    })
    const intents: ActionIntent[] = []
    let remaining = amount
    let priority = priorityBase
    const holdingBalances = new Map(state.holdings.map((holding) => [holding.id, holding.balance]))
    const basisRemaining = new Map(
      state.investmentAccounts.map((account) => [
        account.id,
        sumSeasonedContributions(account.contributionEntries, context.dateIso, 'roth'),
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
      const basisLimit = isRothBasis
        ? basisRemaining.get(holding.investmentAccountId) ?? 0
        : balanceRemaining
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
          label: isRothBasis ? `${label} (roth contributions)` : label,
        })
        priority += 1
        remaining -= withdrawAmount
        holdingBalances.set(holding.id, balanceRemaining - withdrawAmount)
        if (holding.taxType === 'roth') {
          const remainingBasis = basisRemaining.get(holding.investmentAccountId) ?? 0
          basisRemaining.set(
            holding.investmentAccountId,
            Math.max(0, remainingBasis - withdrawAmount),
          )
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

  const exposeForTests = {
    buildWithdrawalOrder: (state: SimulationState, age: number) =>
      buildWithdrawalOrderForStrategy(state, age, {
        withdrawal,
        earlyRetirement: early,
        taxableLot,
      }),
  }

  return {
    id: 'cash-buffer',
    explain,
    ...(process.env.NODE_ENV === 'test' ? { __test: exposeForTests } : {}),
    getCashflowSeries: ({ actions, holdingTaxTypeById }) => {
      let cashDelta = 0
      const investmentByKey: Record<string, number> = {}
      const isRothBasisLabel = (label?: string) =>
        typeof label === 'string' &&
        (label.toLowerCase().includes('roth contributions') ||
          label.toLowerCase().includes('roth basis'))

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
        {
          indexByType: context.inflationIndexByType,
          indexStartDateIso: context.inflationIndexStartDateIso,
        },
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
        const iraLimit = getContributionLimit('ira', context)
        const iraUsed =
          state.yearContributionsByTaxType.roth + state.yearContributionsByTaxType.traditional
        const iraRemaining = Math.max(0, iraLimit - iraUsed)
        explain.addInput('IRA limit', iraLimit)
        explain.addCheckpoint('IRA used', iraUsed)
        explain.addCheckpoint('IRA remaining', iraRemaining)

        const intents: ActionIntent[] = []
        let remaining = excess
        if (iraRemaining > 0) {
          const iraTarget = [...state.holdings]
            .filter((holding) => holding.taxType === 'roth' || holding.taxType === 'traditional')
            .sort((a, b) => b.balance - a.balance)[0]
          if (iraTarget) {
            const amount = Math.min(remaining, iraRemaining)
            if (amount > 0) {
              intents.push({
                id: `cash-buffer-invest-ira-${context.monthIndex}`,
                kind: 'deposit',
                amount,
                targetHoldingId: iraTarget.id,
                fromCash: true,
                priority: 70,
                label: 'Invest excess cash',
              })
              remaining -= amount
            }
          }
        }

        if (remaining > 0) {
          const taxableTarget = [...state.holdings]
            .filter((holding) => holding.taxType === 'taxable')
            .sort((a, b) => b.balance - a.balance)[0]
          if (taxableTarget) {
            intents.push({
              id: `cash-buffer-invest-taxable-${context.monthIndex}`,
              kind: 'deposit',
              amount: remaining,
              targetHoldingId: taxableTarget.id,
              fromCash: true,
              priority: 71,
              label: 'Invest excess cash',
            })
          }
        }

        return intents
      }

      return []
    },
  }
}
