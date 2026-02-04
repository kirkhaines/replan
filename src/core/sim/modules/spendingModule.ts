import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import type { CashflowItem, SimulationModule, SimulationSettings } from '../types'
import { inflateAmount, isSameMonth, isWithinRange } from './utils'

export const createSpendingModule = (
  snapshot: SimulationSnapshot,
  settings?: SimulationSettings,
): SimulationModule => {
  const scenario = snapshot.scenario
  const spendingItems = snapshot.spendingLineItems.filter(
    (item) => item.spendingStrategyId === scenario.spendingStrategyId,
  )
  const activeStrategyIds = new Set(scenario.personStrategyIds)
  const activePersonStrategies = snapshot.personStrategies.filter((strategy) =>
    activeStrategyIds.has(strategy.id),
  )
  const futureWorkStrategyIds = new Set(
    activePersonStrategies.map((strategy) => strategy.futureWorkStrategyId),
  )
  const futureWorkPeriods = snapshot.futureWorkPeriods.filter((period) =>
    futureWorkStrategyIds.has(period.futureWorkStrategyId),
  )
  const explain = createExplainTracker(!settings?.summaryOnly)
  const cpiRate = scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
  const taxDiscountByType: Record<
    'taxable' | 'traditional' | 'roth' | 'hsa',
    number
  > = {
    traditional: 0.85,
    taxable: 0.95,
    roth: 1,
    hsa: 1,
  }
  const minBalanceTimeline = snapshot.minBalanceRun?.timeline ?? []
  const sortedMinBalanceTimeline = [...minBalanceTimeline].sort(
    (a, b) => a.yearIndex - b.yearIndex,
  )
  const sortedMinBalanceTimelineByDate = [...minBalanceTimeline]
    .filter((point) => Boolean(point.date))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  let guardrailTargetMonthIso: string | null = null

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

  const getGuardrailTargetMonthIso = (defaultStartIso: string) => {
    if (futureWorkPeriods.length === 0) {
      return defaultStartIso
    }
    const latestEndIso = futureWorkPeriods.reduce<string | null>((latest, period) => {
      const endIso = period.endDate ?? null
      if (!endIso) {
        return latest
      }
      if (!latest || endIso > latest) {
        return endIso
      }
      return latest
    }, null)
    if (!latestEndIso) {
      return defaultStartIso
    }
    const date = new Date(`${latestEndIso}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) {
      return defaultStartIso
    }
    date.setUTCDate(1)
    date.setUTCMonth(date.getUTCMonth() + 1)
    return date.toISOString().slice(0, 10)
  }

  const getDiscountedTotalBalance = (state: {
    cashAccounts: Array<{ balance: number }>
    holdings: Array<{ balance: number; taxType: 'taxable' | 'traditional' | 'roth' | 'hsa' }>
  }) => {
    const cashTotal = state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)
    const holdingTotal = state.holdings.reduce((sum, holding) => {
      const discount = taxDiscountByType[holding.taxType] ?? 1
      return sum + holding.balance * discount
    }, 0)
    return cashTotal + holdingTotal
  }

  const getTotalBalance = (state: {
    cashAccounts: Array<{ balance: number }>
    holdings: Array<{ balance: number }>
  }) => {
    const cashTotal = state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)
    const holdingTotal = state.holdings.reduce((sum, holding) => sum + holding.balance, 0)
    return cashTotal + holdingTotal
  }

  const interpolateHealthFactor = (
    health: number,
    points: Array<{ health: number; factor: number }>,
  ) => {
    if (points.length === 0) {
      return 1
    }
    const sorted = [...points].sort((a, b) => a.health - b.health)
    if (health <= sorted[0].health) {
      return 0
    }
    const last = sorted[sorted.length - 1]
    if (health >= last.health) {
      return 1
    }
    for (let index = 1; index < sorted.length; index += 1) {
      const upper = sorted[index]
      if (health <= upper.health) {
        const lower = sorted[index - 1]
        const span = Math.max(1e-9, upper.health - lower.health)
        const ratio = (health - lower.health) / span
        return clamp01(lower.factor + (upper.factor - lower.factor) * ratio)
      }
    }
    return 1
  }

  const getMinBalanceForYearIndex = (yearIndex: number) => {
    if (sortedMinBalanceTimeline.length === 0) {
      return null
    }
    let candidate = sortedMinBalanceTimeline[0]
    for (let index = 1; index < sortedMinBalanceTimeline.length; index += 1) {
      const point = sortedMinBalanceTimeline[index]
      if (point.yearIndex > yearIndex) {
        break
      }
      candidate = point
    }
    return candidate.balance
  }

  const getMinBalanceForDate = (dateIso: string, fallbackYearIndex: number) => {
    if (sortedMinBalanceTimelineByDate.length === 0) {
      return getMinBalanceForYearIndex(fallbackYearIndex)
    }
    const targetMs = new Date(`${dateIso}T00:00:00Z`).getTime()
    if (Number.isNaN(targetMs)) {
      return getMinBalanceForYearIndex(fallbackYearIndex)
    }
    const first = sortedMinBalanceTimelineByDate[0]
    const last = sortedMinBalanceTimelineByDate[sortedMinBalanceTimelineByDate.length - 1]
    const firstMs = new Date(`${first.date}T00:00:00Z`).getTime()
    const lastMs = new Date(`${last.date}T00:00:00Z`).getTime()
    if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs)) {
      return getMinBalanceForYearIndex(fallbackYearIndex)
    }
    if (targetMs <= firstMs) {
      return first.balance
    }
    if (targetMs >= lastMs) {
      return last.balance
    }
    for (let index = 1; index < sortedMinBalanceTimelineByDate.length; index += 1) {
      const upper = sortedMinBalanceTimelineByDate[index]
      const lower = sortedMinBalanceTimelineByDate[index - 1]
      const upperMs = new Date(`${upper.date}T00:00:00Z`).getTime()
      if (!Number.isFinite(upperMs)) {
        continue
      }
      if (targetMs <= upperMs) {
        const lowerMs = new Date(`${lower.date}T00:00:00Z`).getTime()
        if (!Number.isFinite(lowerMs) || upperMs === lowerMs) {
          return upper.balance
        }
        const ratio = (targetMs - lowerMs) / (upperMs - lowerMs)
        return lower.balance + (upper.balance - lower.balance) * ratio
      }
    }
    return last.balance
  }

  return {
    id: 'spending',
    explain,
    getCashflowSeries: ({ cashflows }) => {
      const totalCash = cashflows.reduce((sum, flow) => sum + flow.cash, 0)
      if (totalCash === 0) {
        return []
      }
      return [
        {
          key: 'spending:cash',
          label: 'Spending - cash',
          value: totalCash,
          bucket: 'cash',
        },
      ]
    },
    getCashflows: (state, context) => {
      const cashflows: CashflowItem[] = []
      const guardrailConfig = scenario.strategies.withdrawal
      const guardrailStrategy = guardrailConfig.guardrailStrategy
      const lineItemAmounts = spendingItems
        .filter((item) => !item.isWork)
        .filter((item) => isWithinRange(context.dateIso, item.startDate, item.endDate))
        .map((item) => {
          const inflationRate =
            scenario.strategies.returnModel.inflationAssumptions[item.inflationType] ?? 0
          const startIso =
            item.startDate && item.startDate !== '' ? item.startDate : context.settings.startDate
          const needAmount = inflateAmount(
            item.needAmount,
            startIso,
            context.dateIso,
            inflationRate,
          )
          const wantAmount = inflateAmount(
            item.wantAmount,
            startIso,
            context.dateIso,
            inflationRate,
          )
          return {
            item,
            needAmount,
            wantAmount,
            deductionAmount: item.isPreTax ? 1 : 0,
          }
        })
      const totalNeed = lineItemAmounts.reduce((sum, entry) => sum + entry.needAmount, 0)
      const totalWant = lineItemAmounts.reduce((sum, entry) => sum + entry.wantAmount, 0)
      const currentDiscountedBalance = getDiscountedTotalBalance(state)
      const currentTotalBalance = getTotalBalance(state)

      if (!guardrailTargetMonthIso) {
        guardrailTargetMonthIso = getGuardrailTargetMonthIso(context.settings.startDate)
      }
      const retirementStartIso = guardrailTargetMonthIso ?? context.settings.startDate
      const guardrailsEnabled =
        futureWorkPeriods.length === 0 || context.dateIso >= retirementStartIso
      if (
        !state.guardrailTargetDateIso &&
        guardrailTargetMonthIso &&
        (isSameMonth(context.dateIso, guardrailTargetMonthIso) ||
          context.dateIso > guardrailTargetMonthIso)
      ) {
        state.guardrailTargetDateIso = context.dateIso
        state.guardrailTargetBalance = currentDiscountedBalance
        state.guardrailBaselineNeed = totalNeed
        state.guardrailBaselineWant = totalWant
      }

      let guardrailFactor = 1
      let guardrailActive = false
      let guardrailHealth: number | null = null
      if (guardrailsEnabled) {
      if (guardrailStrategy === 'legacy') {
        const guardrailPct = guardrailConfig.guardrailPct
        const targetBalance = state.guardrailTargetBalance ?? currentDiscountedBalance
        guardrailActive =
          guardrailPct > 0 && currentDiscountedBalance < targetBalance * (1 - guardrailPct)
        guardrailFactor = guardrailActive ? 1 - guardrailPct : 1
      } else if (guardrailStrategy === 'cap_wants') {
        if (totalWant > 0 && guardrailConfig.guardrailWithdrawalRateLimit > 0) {
          const monthlyLimit =
            (currentDiscountedBalance * guardrailConfig.guardrailWithdrawalRateLimit) / 12
          const availableForWants = monthlyLimit - totalNeed
          guardrailFactor = clamp01(availableForWants / totalWant)
        }
      } else if (guardrailStrategy === 'portfolio_health') {
        const targetBalance = state.guardrailTargetBalance ?? currentDiscountedBalance
        const targetDate = state.guardrailTargetDateIso ?? context.dateIso
        const inflatedTarget = inflateAmount(targetBalance, targetDate, context.dateIso, cpiRate)
        guardrailHealth = inflatedTarget > 0 ? currentDiscountedBalance / inflatedTarget : 1
        guardrailFactor = interpolateHealthFactor(
          guardrailHealth,
          guardrailConfig.guardrailHealthPoints,
        )
      } else if (guardrailStrategy === 'min_balance_health') {
        const minBalanceTarget = getMinBalanceForDate(context.dateIso, context.yearIndex)
        if (minBalanceTarget && minBalanceTarget > 0) {
          guardrailHealth = currentTotalBalance / minBalanceTarget
          guardrailFactor = interpolateHealthFactor(
            guardrailHealth,
            guardrailConfig.guardrailMinBalanceHealthPoints,
          )
        }
      } else if (guardrailStrategy === 'guyton') {
        const baselineBalance = state.guardrailTargetBalance ?? currentDiscountedBalance
        const baselineSpending = state.guardrailBaselineNeed + state.guardrailBaselineWant
        const baselineRate =
          baselineBalance > 0 ? (baselineSpending / baselineBalance) * 12 : 0
          const currentRate =
            currentDiscountedBalance > 0
              ? ((totalNeed + totalWant) / currentDiscountedBalance) * 12
              : 0
          if (
            baselineRate > 0 &&
            currentRate >
              baselineRate * (1 + guardrailConfig.guardrailGuytonTriggerRateIncrease)
          ) {
            state.guardrailGuytonMonthsRemaining = Math.max(
              state.guardrailGuytonMonthsRemaining,
              guardrailConfig.guardrailGuytonDurationMonths,
            )
          }
          if (state.guardrailGuytonMonthsRemaining > 0) {
            guardrailActive = true
            guardrailFactor = clamp01(1 - guardrailConfig.guardrailGuytonAppliedPct)
            state.guardrailGuytonMonthsRemaining = Math.max(
              0,
              state.guardrailGuytonMonthsRemaining - 1,
            )
          }
        }
      }

      lineItemAmounts.forEach(({ item, needAmount, wantAmount, deductionAmount }) => {
        const adjustedWantAmount = wantAmount * guardrailFactor

        if (needAmount > 0) {
          cashflows.push({
            id: `${item.id}-${context.monthIndex}-need`,
            label: item.name,
            category: 'spending_need',
            cash: -needAmount,
            deductions: deductionAmount ? needAmount : undefined,
          })
        }
        if (adjustedWantAmount > 0) {
          cashflows.push({
            id: `${item.id}-${context.monthIndex}-want`,
            label: item.name,
            category: 'spending_want',
            cash: -adjustedWantAmount,
            deductions: deductionAmount ? adjustedWantAmount : undefined,
          })
        }
      })
      explain.addInput('Line items', spendingItems.length)
      explain.addInput('Guardrail strategy', guardrailStrategy)
      explain.addInput('Guardrail pct', guardrailConfig.guardrailPct)
      explain.addInput('Guardrails enabled', guardrailsEnabled)
      explain.addInput('Guardrail active', guardrailActive)
      explain.addInput('Guardrail health', guardrailHealth ?? 'n/a')
      explain.addInput('Guardrail factor', guardrailFactor)
      state.guardrailFactorSum += guardrailFactor
      state.guardrailFactorCount += 1
      state.guardrailFactorMin = Math.min(state.guardrailFactorMin, guardrailFactor)
      if (guardrailFactor < 1) {
        state.guardrailFactorBelowCount += 1
      }
      const needTotal = Math.abs(
        cashflows.reduce(
          (sum, flow) => (flow.category === 'spending_need' ? sum + flow.cash : sum),
          0,
        ),
      )
      const wantTotal = Math.abs(
        cashflows.reduce(
          (sum, flow) => (flow.category === 'spending_want' ? sum + flow.cash : sum),
          0,
        ),
      )
      const deductions = cashflows.reduce((sum, flow) => sum + (flow.deductions ?? 0), 0)
      explain.addCheckpoint('Need total', needTotal)
      explain.addCheckpoint('Want total', wantTotal)
      explain.addCheckpoint('Deductions', deductions)
      return cashflows
    },
  }
}
