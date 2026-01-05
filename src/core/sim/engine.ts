import type { Person, SimulationResult } from '../models'
import type { SimulationInput } from './input'
import { createSimulationModules } from './modules'
import type {
  ActionIntent,
  ActionRecord,
  CashflowItem,
  MonthlyRecord,
  SimulationContext,
  SimulationState,
  YearRecord,
} from './types'

type MonthTotals = {
  income: number
  spending: number
  contributions: number
  withdrawals: number
  taxes: number
  ordinaryIncome: number
  capitalGains: number
  deductions: number
}

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10)

const addMonths = (date: Date, months: number) => {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

const getAgeInYearsAtDate = (dateOfBirth: string, dateValue: string) => {
  const birth = new Date(dateOfBirth)
  const target = new Date(dateValue)
  let months =
    (target.getFullYear() - birth.getFullYear()) * 12 +
    (target.getMonth() - birth.getMonth())
  if (target.getDate() < birth.getDate()) {
    months -= 1
  }
  return Math.max(0, Math.round((months / 12) * 10) / 10)
}

const createEmptyTotals = (): MonthTotals => ({
  income: 0,
  spending: 0,
  contributions: 0,
  withdrawals: 0,
  taxes: 0,
  ordinaryIncome: 0,
  capitalGains: 0,
  deductions: 0,
})

const createInitialState = (snapshot: SimulationInput['snapshot']): SimulationState => {
  const cashAccounts = snapshot.nonInvestmentAccounts.map((account) => ({
    id: account.id,
    balance: account.balance,
    interestRate: account.interestRate,
  }))
  const holdings = snapshot.investmentAccountHoldings.map((holding) => ({
    id: holding.id,
    investmentAccountId: holding.investmentAccountId,
    taxType: holding.taxType,
    holdingType: holding.holdingType,
    balance: holding.balance,
    contributionBasis: holding.contributionBasis,
    returnRate: holding.returnRate,
    returnStdDev: holding.returnStdDev,
  }))
  const initialBalance =
    cashAccounts.reduce((sum, account) => sum + account.balance, 0) +
    holdings.reduce((sum, holding) => sum + holding.balance, 0)
  return {
    cashAccounts,
    holdings,
    yearLedger: {
      ordinaryIncome: 0,
      capitalGains: 0,
      deductions: 0,
      taxExemptIncome: 0,
      penalties: 0,
      taxPaid: 0,
    },
    magiHistory: {},
    initialBalance,
  }
}

const getPrimaryPerson = (snapshot: SimulationInput['snapshot']): Person | null => {
  const primaryStrategyId = snapshot.scenario.personStrategyIds[0]
  const primaryStrategy = snapshot.personStrategies.find(
    (strategy) => strategy.id === primaryStrategyId,
  )
  const primaryPerson = primaryStrategy
    ? snapshot.people.find((person) => person.id === primaryStrategy.personId)
    : null
  return primaryPerson ?? snapshot.people[0] ?? null
}

const sumCash = (state: SimulationState) =>
  state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)

const sumHoldings = (state: SimulationState) =>
  state.holdings.reduce((sum, holding) => sum + holding.balance, 0)

const applyCashToAccounts = (state: SimulationState, amount: number) => {
  if (state.cashAccounts.length === 0) {
    return
  }
  if (amount >= 0) {
    state.cashAccounts[0].balance += amount
    return
  }
  let remaining = amount
  for (const account of state.cashAccounts) {
    if (remaining >= 0) {
      break
    }
    const available = Math.max(0, account.balance)
    const withdrawal = Math.min(available, Math.abs(remaining))
    account.balance -= withdrawal
    remaining += withdrawal
  }
  if (remaining < 0) {
    state.cashAccounts[0].balance += remaining
  }
}

const applyCashflows = (
  state: SimulationState,
  cashflows: CashflowItem[],
  totals: MonthTotals,
) => {
  cashflows.forEach((flow) => {
    if (flow.cash >= 0) {
      totals.income += flow.cash
    } else {
      const amount = Math.abs(flow.cash)
      if (flow.category === 'tax') {
        totals.taxes += amount
        state.yearLedger.taxPaid += amount
      } else {
        totals.spending += amount
      }
    }
    applyCashToAccounts(state, flow.cash)
    state.yearLedger.ordinaryIncome += flow.ordinaryIncome ?? 0
    state.yearLedger.capitalGains += flow.capitalGains ?? 0
    state.yearLedger.deductions += flow.deductions ?? 0
    state.yearLedger.taxExemptIncome += flow.taxExemptIncome ?? 0
    totals.ordinaryIncome += flow.ordinaryIncome ?? 0
    totals.capitalGains += flow.capitalGains ?? 0
    totals.deductions += flow.deductions ?? 0
  })
}

const applyHoldingWithdrawal = (
  state: SimulationState,
  holdingId: string,
  amount: number,
  totals: MonthTotals,
  context: SimulationContext,
  taxTreatmentOverride?: ActionIntent['taxTreatment'],
  skipPenalty?: boolean,
) => {
  const holding = state.holdings.find((entry) => entry.id === holdingId)
  if (!holding || amount <= 0) {
    return 0
  }
  const startingBalance = holding.balance
  const withdrawal = Math.min(amount, holding.balance)
  if (withdrawal <= 0) {
    return 0
  }
  holding.balance -= withdrawal
  if (taxTreatmentOverride === 'ordinary') {
    state.yearLedger.ordinaryIncome += withdrawal
    totals.ordinaryIncome += withdrawal
  } else if (taxTreatmentOverride === 'capital_gains') {
    state.yearLedger.capitalGains += withdrawal
    totals.capitalGains += withdrawal
  } else if (taxTreatmentOverride === 'tax_exempt') {
    state.yearLedger.taxExemptIncome += withdrawal
  } else if (holding.taxType === 'taxable') {
    const basisMethod = context.snapshot.scenario.strategies.taxableLot.costBasisMethod
    const basisRatio = startingBalance > 0 ? holding.contributionBasis / startingBalance : 0
    // FIFO/LIFO need lot data; fall back to average-basis for now.
    const basisUsed = withdrawal * (basisMethod === 'average' ? basisRatio : basisRatio)
    holding.contributionBasis = Math.max(0, holding.contributionBasis - basisUsed)
    const gain = Math.max(0, withdrawal - basisUsed)
    state.yearLedger.capitalGains += gain
    totals.capitalGains += gain
  } else if (holding.taxType === 'traditional') {
    state.yearLedger.ordinaryIncome += withdrawal
    totals.ordinaryIncome += withdrawal
  } else {
    state.yearLedger.taxExemptIncome += withdrawal
  }

  const early = context.snapshot.scenario.strategies.earlyRetirement
  const penaltyApplies =
    !skipPenalty &&
    context.age < 59.5 &&
    ((holding.taxType === 'traditional' && !early.use72t) ||
      (holding.taxType === 'roth' && !early.useRothBasisFirst))
  if (penaltyApplies) {
    state.yearLedger.penalties += withdrawal * early.penaltyRate
  }
  totals.withdrawals += withdrawal
  return withdrawal
}

const withdrawProRata = (
  state: SimulationState,
  amount: number,
  totals: MonthTotals,
  context: SimulationContext,
  taxTreatmentOverride?: ActionIntent['taxTreatment'],
  skipPenalty?: boolean,
) => {
  const totalHoldings = sumHoldings(state)
  if (totalHoldings <= 0 || amount <= 0) {
    return 0
  }
  let remaining = amount
  state.holdings.forEach((holding, index) => {
    if (remaining <= 0) {
      return
    }
    const weight = holding.balance / totalHoldings
    const target =
      index === state.holdings.length - 1 ? remaining : Math.max(0, amount * weight)
    const applied = applyHoldingWithdrawal(
      state,
      holding.id,
      target,
      totals,
      context,
      taxTreatmentOverride,
      skipPenalty,
    )
    remaining -= applied
  })
  return amount - remaining
}

const resolveIntents = (
  intents: ActionIntent[],
  state: SimulationState,
): ActionRecord[] => {
  const sorted = [...intents].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  return sorted.map((intent) => {
    if (intent.kind === 'withdraw') {
      const available = sumHoldings(state)
      return { ...intent, resolvedAmount: Math.min(intent.amount, available) }
    }
    return { ...intent, resolvedAmount: intent.amount }
  })
}

const applyActions = (
  state: SimulationState,
  actions: ActionRecord[],
  totals: MonthTotals,
  context: SimulationContext,
) => {
  actions.forEach((action) => {
    if (action.kind === 'withdraw') {
      const applied =
        action.sourceHoldingId
          ? applyHoldingWithdrawal(
              state,
              action.sourceHoldingId,
              action.resolvedAmount,
              totals,
              context,
              action.taxTreatment,
              action.skipPenalty,
            )
          : withdrawProRata(
              state,
              action.resolvedAmount,
              totals,
              context,
              action.taxTreatment,
              action.skipPenalty,
            )
      if (applied > 0) {
        applyCashToAccounts(state, applied)
      }
      return
    }
    if (action.kind === 'deposit') {
      if (action.targetHoldingId) {
        const holding = state.holdings.find((entry) => entry.id === action.targetHoldingId)
        if (holding) {
          if (action.fromCash !== false) {
            applyCashToAccounts(state, -action.resolvedAmount)
          }
          holding.balance += action.resolvedAmount
          if (holding.taxType === 'taxable') {
            holding.contributionBasis += action.resolvedAmount
          }
          totals.contributions += action.resolvedAmount
        }
      } else {
        applyCashToAccounts(state, action.resolvedAmount)
        totals.contributions += action.resolvedAmount
      }
      return
    }
    if (action.kind === 'convert') {
      const sourceHolding =
        action.sourceHoldingId ??
        state.holdings.find((holding) => holding.taxType === 'traditional')?.id
      const targetHolding =
        action.targetHoldingId ??
        state.holdings.find((holding) => holding.taxType === 'roth')?.id
      if (!sourceHolding || !targetHolding) {
        return
      }
      const applied = applyHoldingWithdrawal(
        state,
        sourceHolding,
        action.resolvedAmount,
        totals,
        context,
        'ordinary',
        true,
      )
      if (applied > 0) {
        const holding = state.holdings.find((entry) => entry.id === targetHolding)
        if (holding) {
          holding.balance += applied
        }
      }
    }
  })
}

const buildMonthlyRecord = (
  monthIndex: number,
  dateIso: string,
  age: number,
  totals: MonthTotals,
  state: SimulationState,
): MonthlyRecord => {
  const cashBalance = sumCash(state)
  const investmentBalance = sumHoldings(state)
  return {
    monthIndex,
    date: dateIso,
    age,
    cashBalance,
    investmentBalance,
    totalBalance: cashBalance + investmentBalance,
    income: totals.income,
    spending: totals.spending,
    contributions: totals.contributions,
    withdrawals: totals.withdrawals,
    taxes: totals.taxes,
    ordinaryIncome: totals.ordinaryIncome,
    capitalGains: totals.capitalGains,
    deductions: totals.deductions,
  }
}

const buildYearRecord = (
  yearIndex: number,
  age: number,
  dateIso: string,
  totals: MonthTotals,
  state: SimulationState,
): YearRecord => {
  const cashBalance = sumCash(state)
  const investmentBalance = sumHoldings(state)
  return {
    yearIndex,
    age,
    date: dateIso,
    cashBalance,
    investmentBalance,
    totalBalance: cashBalance + investmentBalance,
    income: totals.income,
    spending: totals.spending,
    contributions: totals.contributions,
    withdrawals: totals.withdrawals,
    taxes: totals.taxes,
  }
}

export const runSimulation = (input: SimulationInput): SimulationResult => {
  const { snapshot, settings } = input
  const modules = createSimulationModules(snapshot, settings)
  modules.forEach((module) => module.buildPlan?.(snapshot, settings))

  const state = createInitialState(snapshot)
  const monthlyTimeline: MonthlyRecord[] = []
  const timeline: YearRecord[] = []

  const primaryPerson = getPrimaryPerson(snapshot)
  const start = new Date(settings.startDate)
  const totalMonths = settings.months
  let minBalance = Number.POSITIVE_INFINITY
  let maxBalance = Number.NEGATIVE_INFINITY

  let yearTotals = createEmptyTotals()

  for (let monthIndex = 0; monthIndex < totalMonths; monthIndex += settings.stepMonths) {
    const date = addMonths(start, monthIndex)
    const dateIso = toIsoDate(date)
    const yearIndex = Math.floor(monthIndex / 12)
    const isStartOfYear = monthIndex % 12 === 0
    const isEndOfYear = monthIndex % 12 === 11 || monthIndex + 1 >= totalMonths
    const age = primaryPerson
      ? getAgeInYearsAtDate(primaryPerson.dateOfBirth, dateIso)
      : yearIndex

    if (isStartOfYear) {
      state.yearLedger = {
        ordinaryIncome: 0,
        capitalGains: 0,
        deductions: 0,
        taxExemptIncome: 0,
        penalties: 0,
        taxPaid: 0,
      }
      yearTotals = createEmptyTotals()
    }

    const context: SimulationContext = {
      snapshot,
      settings,
      monthIndex,
      yearIndex,
      age,
      date,
      dateIso,
      isStartOfYear,
      isEndOfYear,
    }

    if (isStartOfYear) {
      modules.forEach((module) => module.onStartOfYear?.(state, context))
    }
    modules.forEach((module) => module.onStartOfMonth?.(state, context))

    const monthTotals = createEmptyTotals()
    const cashflows = modules.flatMap((module) => module.getCashflows?.(state, context) ?? [])
    applyCashflows(state, cashflows, monthTotals)

    const intents = modules.flatMap((module) => module.getActionIntents?.(state, context) ?? [])
    const actions = resolveIntents(intents, state)
    applyActions(state, actions, monthTotals, context)

    modules.forEach((module) => module.onEndOfMonth?.(state, context))

    const monthRecord = buildMonthlyRecord(monthIndex, dateIso, age, monthTotals, state)
    monthlyTimeline.push(monthRecord)

    const totalBalance = monthRecord.totalBalance
    minBalance = Math.min(minBalance, totalBalance)
    maxBalance = Math.max(maxBalance, totalBalance)

    yearTotals = {
      income: yearTotals.income + monthTotals.income,
      spending: yearTotals.spending + monthTotals.spending,
      contributions: yearTotals.contributions + monthTotals.contributions,
      withdrawals: yearTotals.withdrawals + monthTotals.withdrawals,
      taxes: yearTotals.taxes + monthTotals.taxes,
      ordinaryIncome: yearTotals.ordinaryIncome + monthTotals.ordinaryIncome,
      capitalGains: yearTotals.capitalGains + monthTotals.capitalGains,
      deductions: yearTotals.deductions + monthTotals.deductions,
    }

    if (isEndOfYear) {
      modules.forEach((module) => module.onEndOfYear?.(state, context))
      const yearRecord = buildYearRecord(yearIndex, age, dateIso, yearTotals, state)
      timeline.push(yearRecord)
    }
  }

  const endingBalance =
    monthlyTimeline.length > 0 ? monthlyTimeline[monthlyTimeline.length - 1].totalBalance : 0

  return {
    timeline: timeline.map((point) => ({
      yearIndex: point.yearIndex,
      age: point.age,
      balance: point.totalBalance,
      contribution: point.contributions,
      spending: point.spending,
      income: point.income,
      withdrawals: point.withdrawals,
      taxes: point.taxes,
      cashBalance: point.cashBalance,
      investmentBalance: point.investmentBalance,
      date: point.date,
    })),
    monthlyTimeline,
    summary: {
      endingBalance,
      minBalance: Number.isFinite(minBalance) ? minBalance : 0,
      maxBalance: Number.isFinite(maxBalance) ? maxBalance : 0,
    },
  }
}
