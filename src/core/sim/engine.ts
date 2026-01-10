import type {
  AccountBalanceSnapshot,
  ExplainMetric,
  MarketReturn,
  ModuleRunExplanation,
  MonthExplanation,
  Person,
  SimulationResult,
} from '../models'
import type { SimulationInput } from './input'
import { createSimulationModules } from './modules'
import { computeIrmaaSurcharge, computeTax, selectIrmaaTable, selectTaxPolicy } from './tax'
import type {
  ActionIntent,
  ActionRecord,
  CashflowItem,
  MonthlyRecord,
  SimulationContext,
  SimulationState,
  YearRecord,
} from './types'
import {
  inflateAmount,
  interpolateTargets,
  isWithinRange,
  sumMonthlySpending,
} from './modules/utils'

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

type ActionIntentWithModule = ActionIntent & { moduleId: string }
type ActionRecordWithModule = ActionRecord & { moduleId: string }

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

const createEmptyCashflowTotals = () => ({
  cash: 0,
  ordinaryIncome: 0,
  capitalGains: 0,
  deductions: 0,
  taxExemptIncome: 0,
})

const createEmptyActionTotals = () => ({
  deposit: 0,
  withdraw: 0,
  convert: 0,
})

const createEmptyMarketTotals = () => ({
  cash: 0,
  holdings: 0,
  total: 0,
})

const sumCashflowTotals = (cashflows: CashflowItem[]) => {
  const totals = createEmptyCashflowTotals()
  cashflows.forEach((flow) => {
    totals.cash += flow.cash
    totals.ordinaryIncome += flow.ordinaryIncome ?? 0
    totals.capitalGains += flow.capitalGains ?? 0
    totals.deductions += flow.deductions ?? 0
    totals.taxExemptIncome += flow.taxExemptIncome ?? 0
  })
  return totals
}

const sumActionTotals = (actions: ActionRecord[]) => {
  const totals = createEmptyActionTotals()
  actions.forEach((action) => {
    if (action.kind === 'deposit') {
      totals.deposit += action.resolvedAmount
    } else if (action.kind === 'withdraw') {
      totals.withdraw += action.resolvedAmount
    } else if (action.kind === 'convert') {
      totals.convert += action.resolvedAmount
    }
  })
  return totals
}

const sumMarketTotals = (marketReturns: MarketReturn[]) => {
  const totals = createEmptyMarketTotals()
  marketReturns.forEach((entry) => {
    if (entry.kind === 'cash') {
      totals.cash += entry.amount
    } else {
      totals.holdings += entry.amount
    }
    totals.total += entry.amount
  })
  return totals
}

const buildAccountBalances = (state: SimulationState): AccountBalanceSnapshot[] => [
  ...state.cashAccounts.map((account) => ({
    id: account.id,
    kind: 'cash' as const,
    balance: account.balance,
  })),
  ...state.holdings.map((holding) => ({
    id: holding.id,
    kind: 'holding' as const,
    balance: holding.balance,
    investmentAccountId: holding.investmentAccountId,
  })),
]

const toMetric = (label: string, value: ExplainMetric['value']): ExplainMetric => ({
  label,
  value,
})

const buildMarketReturns = (
  state: SimulationState,
  beforeCash: Map<string, number>,
  beforeHoldings: Map<string, number>,
): MarketReturn[] => {
  const returns: MarketReturn[] = []
  state.cashAccounts.forEach((account) => {
    const start = beforeCash.get(account.id) ?? 0
    const end = account.balance
    const amount = end - start
    returns.push({
      id: account.id,
      kind: 'cash',
      balanceStart: start,
      balanceEnd: end,
      amount,
      rate: start > 0 ? amount / start : 0,
    })
  })
  state.holdings.forEach((holding) => {
    const start = beforeHoldings.get(holding.id) ?? 0
    const end = holding.balance
    const amount = end - start
    returns.push({
      id: holding.id,
      kind: 'holding',
      balanceStart: start,
      balanceEnd: end,
      amount,
      rate: start > 0 ? amount / start : 0,
      investmentAccountId: holding.investmentAccountId,
      holdingType: holding.holdingType,
      taxType: holding.taxType,
    })
  })
  return returns
}

const sumCashflowCategory = (cashflows: CashflowItem[], category: CashflowItem['category']) =>
  cashflows.reduce((sum, flow) => (flow.category === category ? sum + flow.cash : sum), 0)

const sumCashflowField = (
  cashflows: CashflowItem[],
  field: 'ordinaryIncome' | 'capitalGains' | 'deductions' | 'taxExemptIncome',
) => cashflows.reduce((sum, flow) => sum + (flow[field] ?? 0), 0)

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

const cloneState = (state: SimulationState): SimulationState => ({
  cashAccounts: state.cashAccounts.map((account) => ({
    id: account.id,
    balance: account.balance,
    interestRate: account.interestRate,
  })),
  holdings: state.holdings.map((holding) => ({
    id: holding.id,
    investmentAccountId: holding.investmentAccountId,
    taxType: holding.taxType,
    holdingType: holding.holdingType,
    balance: holding.balance,
    contributionBasis: holding.contributionBasis,
    returnRate: holding.returnRate,
    returnStdDev: holding.returnStdDev,
  })),
  yearLedger: { ...state.yearLedger },
  magiHistory: { ...state.magiHistory },
  initialBalance: state.initialBalance,
})

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
  intents: ActionIntentWithModule[],
  state: SimulationState,
): ActionRecordWithModule[] => {
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
  actions: ActionRecordWithModule[],
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

const formatTargetWeights = (target: ReturnType<typeof interpolateTargets> | null) => {
  if (!target) {
    return 'none'
  }
  return [
    `equity ${(target.equity * 100).toFixed(1)}%`,
    `bonds ${(target.bonds * 100).toFixed(1)}%`,
    `cash ${(target.cash * 100).toFixed(1)}%`,
    `realEstate ${(target.realEstate * 100).toFixed(1)}%`,
    `other ${(target.other * 100).toFixed(1)}%`,
  ].join(', ')
}

const buildModuleExplain = ({
  moduleId,
  snapshot,
  state,
  context,
  cashflows,
  actions,
  cashflowTotals,
  marketTotals,
}: {
  moduleId: string
  snapshot: SimulationInput['snapshot']
  state: SimulationState
  context: SimulationContext
  cashflows: CashflowItem[]
  actions: ActionRecord[]
  cashflowTotals: ReturnType<typeof sumCashflowTotals>
  marketTotals?: ReturnType<typeof sumMarketTotals>
}): { inputs?: ExplainMetric[]; checkpoints?: ExplainMetric[] } => {
  const inputs: ExplainMetric[] = []
  const checkpoints: ExplainMetric[] = []
  const scenario = snapshot.scenario

  switch (moduleId) {
    case 'spending': {
      const spendingItems = snapshot.spendingLineItems.filter(
        (item) => item.spendingStrategyId === scenario.spendingStrategyId,
      )
      const guardrailPct = scenario.strategies.withdrawal.guardrailPct
      const totalBalance = sumCash(state) + sumHoldings(state)
      const guardrailActive =
        guardrailPct > 0 && totalBalance < state.initialBalance * (1 - guardrailPct)
      const guardrailFactor = guardrailActive ? 1 - guardrailPct : 1
      inputs.push(
        toMetric('Line items', spendingItems.length),
        toMetric('Guardrail pct', guardrailPct),
        toMetric('Guardrail active', guardrailActive),
        toMetric('Guardrail factor', guardrailFactor),
      )
      checkpoints.push(
        toMetric('Need total', Math.abs(sumCashflowCategory(cashflows, 'spending_need'))),
        toMetric('Want total', Math.abs(sumCashflowCategory(cashflows, 'spending_want'))),
        toMetric('Deductions', sumCashflowField(cashflows, 'deductions')),
      )
      break
    }
    case 'events': {
      inputs.push(toMetric('Events', scenario.strategies.events.length))
      checkpoints.push(
        toMetric('Triggered events', cashflows.length),
        toMetric('Net cash', cashflowTotals.cash),
      )
      break
    }
    case 'pensions': {
      inputs.push(toMetric('Pensions', scenario.strategies.pensions.length))
      checkpoints.push(
        toMetric('Total payout', cashflowTotals.cash),
        toMetric('Ordinary income', cashflowTotals.ordinaryIncome),
      )
      break
    }
    case 'healthcare': {
      const strategy = scenario.strategies.healthcare
      const taxStrategy = scenario.strategies.tax
      const isMedicare = context.age >= 65
      const baseMonthly = isMedicare
        ? strategy.medicarePartBMonthly + strategy.medicarePartDMonthly + strategy.medigapMonthly
        : strategy.preMedicareMonthly
      const inflationRate =
        scenario.strategies.returnModel.inflationAssumptions[strategy.inflationType] ?? 0
      const inflatedBase = inflateAmount(
        baseMonthly,
        context.settings.startDate,
        context.dateIso,
        inflationRate,
      )
      let irmaaSurcharge = 0
      let magiLookback: number | null = null
      let magi = 0
      if (isMedicare && strategy.applyIrmaa) {
        const table = selectIrmaaTable(
          snapshot.irmaaTables,
          context.date.getFullYear(),
          taxStrategy.filingStatus,
        )
        magiLookback = table?.lookbackYears ?? 0
        magi = state.magiHistory[context.yearIndex - (magiLookback ?? 0)] ?? 0
        const surcharge = computeIrmaaSurcharge(table, magi)
        irmaaSurcharge = surcharge.partBMonthly + surcharge.partDMonthly
      }
      inputs.push(
        toMetric('Is Medicare', isMedicare),
        toMetric('Inflation type', strategy.inflationType),
        toMetric('Apply IRMAA', strategy.applyIrmaa),
        toMetric('Base monthly', baseMonthly),
      )
      if (magiLookback !== null) {
        inputs.push(toMetric('IRMAA lookback years', magiLookback))
      }
      checkpoints.push(
        toMetric('Inflated base', inflatedBase),
        toMetric('IRMAA surcharge', irmaaSurcharge),
        toMetric('Total', inflatedBase + irmaaSurcharge),
      )
      if (strategy.applyIrmaa) {
        checkpoints.push(toMetric('MAGI', magi))
      }
      break
    }
    case 'charitable': {
      const strategy = scenario.strategies.charitable
      const monthlyGiving = strategy.annualGiving / 12
      const qcdAnnual = strategy.useQcd
        ? strategy.qcdAnnualAmount > 0
          ? Math.min(strategy.annualGiving, strategy.qcdAnnualAmount)
          : strategy.annualGiving
        : 0
      const qcdMonthly = strategy.useQcd ? qcdAnnual / 12 : 0
      const deduction =
        strategy.useQcd && context.age >= 70.5
          ? Math.max(0, monthlyGiving - qcdMonthly)
          : monthlyGiving
      inputs.push(
        toMetric('Annual giving', strategy.annualGiving),
        toMetric('Use QCD', strategy.useQcd),
        toMetric('QCD annual', strategy.qcdAnnualAmount),
        toMetric('Start age', strategy.startAge),
        toMetric('End age', strategy.endAge),
      )
      checkpoints.push(
        toMetric('Monthly giving', monthlyGiving),
        toMetric('QCD monthly', qcdMonthly),
        toMetric('Deduction', deduction),
      )
      break
    }
    case 'future-work': {
      const activeStrategyIds = new Set(scenario.personStrategyIds)
      const activePersonStrategies = snapshot.personStrategies.filter((strategy) =>
        activeStrategyIds.has(strategy.id),
      )
      const futureWorkStrategyIds = new Set(
        activePersonStrategies.map((strategy) => strategy.futureWorkStrategyId),
      )
      const periods = snapshot.futureWorkPeriods.filter((period) =>
        futureWorkStrategyIds.has(period.futureWorkStrategyId),
      )
      const activePeriods = periods.filter((period) =>
        isWithinRange(context.dateIso, period.startDate, period.endDate),
      )
      const cpiRate = scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
      const contributionLimits = snapshot.contributionLimits ?? []
      const getContributionLimit = (type: '401k' | 'hsa') => {
        if (contributionLimits.length === 0) {
          return 0
        }
        const year = context.date.getFullYear()
        const sorted = [...contributionLimits]
          .filter((limit) => limit.type === type)
          .sort((a, b) => b.year - a.year)
        if (sorted.length === 0) {
          return 0
        }
        const base = sorted.find((limit) => limit.year <= year) ?? sorted[0]
        const baseIso = `${base.year}-01-01`
        return inflateAmount(base.amount, baseIso, context.dateIso, cpiRate)
      }
      const max401k = getContributionLimit('401k')
      const maxHsa = getContributionLimit('hsa')
      const getEmployee401kAnnual = (period: (typeof periods)[number]) => {
        let annual = 0
        if (period['401kContributionType'] === 'max') {
          annual = max401k
        } else if (period['401kContributionType'] === 'fixed') {
          annual = period['401kContributionAnnual']
        } else if (period['401kContributionType'] === 'percent') {
          annual = period.salary * period['401kContributionPct']
        }
        return annual
      }
      const getEmployeeHsaAnnual = (period: (typeof periods)[number]) => {
        return period['hsaUseMaxLimit'] ? maxHsa : period['hsaContributionAnnual']
      }
      const monthlyIncomeTotal = activePeriods.reduce(
        (sum, period) => sum + period.salary / 12 + period.bonus / 12,
        0,
      )
      const employeeMonthlyTotal = activePeriods.reduce(
        (sum, period) => sum + getEmployee401kAnnual(period) / 12,
        0,
      )
      const employerMonthlyTotal = activePeriods.reduce((sum, period) => {
        const employeeAnnual = getEmployee401kAnnual(period)
        const matchBase = Math.min(employeeAnnual, period.salary * period['401kMatchPctCap'])
        return sum + (matchBase * period['401kMatchRatio']) / 12
      }, 0)
      const hsaEmployeeMonthlyTotal = activePeriods.reduce(
        (sum, period) => sum + getEmployeeHsaAnnual(period) / 12,
        0,
      )
      const hsaEmployerMonthlyTotal = activePeriods.reduce(
        (sum, period) => sum + period['hsaEmployerContributionAnnual'] / 12,
        0,
      )
      inputs.push(
        toMetric('Periods', periods.length),
        toMetric('Active periods', activePeriods.length),
        toMetric('Max 401k', max401k),
        toMetric('Max HSA', maxHsa),
      )
      checkpoints.push(
        toMetric('Monthly income', monthlyIncomeTotal),
        toMetric('Employee 401k', employeeMonthlyTotal),
        toMetric('Employer match', employerMonthlyTotal),
        toMetric('Employee HSA', hsaEmployeeMonthlyTotal),
        toMetric('Employer HSA', hsaEmployerMonthlyTotal),
      )
      break
    }
    case 'social-security': {
      const cpiRate = scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
      inputs.push(
        toMetric('Strategy count', snapshot.socialSecurityStrategies.length),
        toMetric('CPI rate', cpiRate),
      )
      checkpoints.push(
        toMetric('Benefit count', cashflows.length),
        toMetric('Benefit total', cashflowTotals.cash),
      )
      break
    }
    case 'cash-buffer': {
      const strategy = scenario.strategies.cashBuffer
      const withdrawal = scenario.strategies.withdrawal
      const early = scenario.strategies.earlyRetirement
      const spendingItems = snapshot.spendingLineItems.filter(
        (item) => item.spendingStrategyId === scenario.spendingStrategyId,
      )
      const monthlySpending = sumMonthlySpending(
        spendingItems,
        scenario,
        context.dateIso,
        context.settings.startDate,
      )
      const cashBalance = sumCash(state)
      const bridgeMonths = Math.max(0, early.bridgeCashYears) * 12
      const targetMonths = Math.max(strategy.targetMonths, bridgeMonths)
      const minMonths = withdrawal.useCashFirst ? strategy.minMonths : targetMonths
      const maxMonths = Math.max(strategy.maxMonths, targetMonths)
      const target = monthlySpending * targetMonths
      const min = monthlySpending * minMonths
      const max = monthlySpending * maxMonths
      const refillNeeded = cashBalance < min ? Math.max(0, target - cashBalance) : 0
      const investExcess = cashBalance > max ? Math.max(0, cashBalance - target) : 0
      inputs.push(
        toMetric('Monthly spending', monthlySpending),
        toMetric('Cash balance', cashBalance),
        toMetric('Target months', targetMonths),
        toMetric('Min months', minMonths),
        toMetric('Max months', maxMonths),
        toMetric('Order', withdrawal.order.join(', ')),
        toMetric('Avoid penalty', withdrawal.avoidEarlyPenalty),
        toMetric('Allow penalty', early.allowPenalty),
        toMetric('Age', context.age),
      )
      checkpoints.push(
        toMetric('Target', target),
        toMetric('Min', min),
        toMetric('Max', max),
        toMetric('Refill needed', refillNeeded),
        toMetric('Invest excess', investExcess),
      )
      break
    }
    case 'rebalancing': {
      const { glidepath, rebalancing } = scenario.strategies
      const shouldRebalance =
        rebalancing.frequency === 'monthly'
          ? true
          : rebalancing.frequency === 'quarterly'
            ? context.monthIndex % 3 === 2
            : rebalancing.frequency === 'annual'
              ? context.isEndOfYear
              : true
      const key = glidepath.mode === 'year' ? context.yearIndex : context.age
      const target = interpolateTargets(glidepath.targets, key)
      inputs.push(
        toMetric('Frequency', rebalancing.frequency),
        toMetric('Tax aware', rebalancing.taxAware),
        toMetric('Use contributions', rebalancing.useContributions),
        toMetric('Drift threshold', rebalancing.driftThreshold),
        toMetric('Min trade', rebalancing.minTradeAmount),
      )
      checkpoints.push(
        toMetric('Should rebalance', shouldRebalance),
        toMetric('Target weights', formatTargetWeights(target)),
        toMetric('Trades', actions.length),
      )
      break
    }
    case 'conversions': {
      const { rothConversion, rothLadder, tax } = scenario.strategies
      const age = context.age
      const isAgeInRange = (value: number, startAge: number, endAge: number) => {
        if (startAge > 0 && value < startAge) {
          return false
        }
        if (endAge > 0 && value > endAge) {
          return false
        }
        return true
      }
      const ladderStartAge =
        rothLadder.startAge > 0
          ? Math.max(0, rothLadder.startAge - rothLadder.leadTimeYears)
          : 0
      const ladderEndAge =
        rothLadder.endAge > 0
          ? Math.max(0, rothLadder.endAge - rothLadder.leadTimeYears)
          : 0
      let ladderAmount = 0
      if (rothLadder.enabled && isAgeInRange(age, ladderStartAge, ladderEndAge)) {
        ladderAmount =
          rothLadder.annualConversion > 0
            ? rothLadder.annualConversion
            : rothLadder.targetAfterTaxSpending
      }
      let conversionCandidate = 0
      if (rothConversion.enabled && isAgeInRange(age, rothConversion.startAge, rothConversion.endAge)) {
        if (rothConversion.targetOrdinaryBracketRate > 0) {
          const policy = selectTaxPolicy(
            snapshot.taxPolicies,
            context.date.getFullYear(),
            tax.filingStatus,
          )
          const bracket = policy?.ordinaryBrackets.find(
            (entry) => entry.rate === rothConversion.targetOrdinaryBracketRate,
          )
          if (bracket?.upTo !== null && bracket?.upTo !== undefined) {
            conversionCandidate = Math.max(0, bracket.upTo - state.yearLedger.ordinaryIncome)
          }
        }
        if (rothConversion.respectIrmaa) {
          const table = selectIrmaaTable(
            snapshot.irmaaTables,
            context.date.getFullYear(),
            tax.filingStatus,
          )
          const baseTier = table?.tiers[0]?.maxMagi ?? 0
          const currentMagi =
            state.yearLedger.ordinaryIncome +
            state.yearLedger.capitalGains +
            state.yearLedger.taxExemptIncome
          if (baseTier > 0) {
            conversionCandidate = Math.min(conversionCandidate, Math.max(0, baseTier - currentMagi))
          }
        }
        if (rothConversion.minConversion > 0) {
          conversionCandidate = Math.max(conversionCandidate, rothConversion.minConversion)
        }
        if (rothConversion.maxConversion > 0) {
          conversionCandidate = Math.min(conversionCandidate, rothConversion.maxConversion)
        }
      }
      const conversionAmount = ladderAmount + conversionCandidate
      inputs.push(
        toMetric('Roth ladder', rothLadder.enabled),
        toMetric('Roth conversion', rothConversion.enabled),
        toMetric('Age', age),
        toMetric('Target bracket rate', rothConversion.targetOrdinaryBracketRate),
        toMetric('Respect IRMAA', rothConversion.respectIrmaa),
        toMetric('Min conversion', rothConversion.minConversion),
        toMetric('Max conversion', rothConversion.maxConversion),
      )
      checkpoints.push(
        toMetric('Ladder amount', ladderAmount),
        toMetric('Conversion candidate', conversionCandidate),
        toMetric('Conversion total', conversionAmount),
      )
      break
    }
    case 'rmd': {
      const strategy = scenario.strategies.rmd
      const isEligible = strategy.enabled && context.isStartOfYear && context.age >= strategy.startAge
      let divisor = 0
      let eligibleBalance = 0
      let totalRmd = 0
      if (isEligible) {
        const ageKey = Math.floor(context.age)
        divisor =
          snapshot.rmdTable.find((entry) => entry.age === ageKey)?.divisor ??
          snapshot.rmdTable[snapshot.rmdTable.length - 1]?.divisor ??
          1
        const eligibleHoldings = state.holdings.filter((holding) =>
          strategy.accountTypes.includes(holding.taxType),
        )
        eligibleBalance = eligibleHoldings.reduce((sum, holding) => sum + holding.balance, 0)
        if (eligibleBalance > 0 && divisor > 0) {
          totalRmd = eligibleBalance / divisor
        }
      }
      inputs.push(
        toMetric('Enabled', strategy.enabled),
        toMetric('Start age', strategy.startAge),
        toMetric('Account types', strategy.accountTypes.join(', ')),
        toMetric('Withholding rate', strategy.withholdingRate),
        toMetric('Excess handling', strategy.excessHandling),
      )
      checkpoints.push(
        toMetric('Eligible balance', eligibleBalance),
        toMetric('Divisor', divisor),
        toMetric('Total RMD', totalRmd),
      )
      break
    }
    case 'taxes': {
      const taxStrategy = scenario.strategies.tax
      const policyYear = taxStrategy.policyYear || context.date.getFullYear()
      const policy = selectTaxPolicy(snapshot.taxPolicies, policyYear, taxStrategy.filingStatus)
      inputs.push(
        toMetric('Policy year', policyYear),
        toMetric('Filing status', taxStrategy.filingStatus),
        toMetric('State tax rate', taxStrategy.stateTaxRate),
        toMetric('Use standard deduction', taxStrategy.useStandardDeduction),
        toMetric('Apply cap gains rates', taxStrategy.applyCapitalGainsRates),
      )
      if (context.isEndOfYear && policy) {
        const taxResult = computeTax({
          ordinaryIncome: state.yearLedger.ordinaryIncome,
          capitalGains: state.yearLedger.capitalGains,
          deductions: state.yearLedger.deductions,
          taxExemptIncome: state.yearLedger.taxExemptIncome,
          stateTaxRate: taxStrategy.stateTaxRate,
          policy,
          useStandardDeduction: taxStrategy.useStandardDeduction,
          applyCapitalGainsRates: taxStrategy.applyCapitalGainsRates,
        })
        const totalTax = taxResult.taxOwed + state.yearLedger.penalties
        checkpoints.push(
          toMetric('Ordinary income', state.yearLedger.ordinaryIncome),
          toMetric('Capital gains', state.yearLedger.capitalGains),
          toMetric('Deductions', state.yearLedger.deductions),
          toMetric('Tax exempt', state.yearLedger.taxExemptIncome),
          toMetric('Tax owed', taxResult.taxOwed),
          toMetric('Penalties', state.yearLedger.penalties),
          toMetric('Total tax', totalTax),
          toMetric('MAGI', taxResult.magi),
          toMetric('Taxable ordinary', taxResult.taxableOrdinaryIncome),
          toMetric('Taxable cap gains', taxResult.taxableCapitalGains),
          toMetric('Std deduction', taxResult.standardDeductionApplied),
        )
      } else {
        checkpoints.push(toMetric('Taxes applied', false))
      }
      break
    }
    case 'returns-core': {
      const returnModel = scenario.strategies.returnModel
      inputs.push(
        toMetric('Mode', returnModel.mode),
        toMetric('Sequence model', returnModel.sequenceModel),
        toMetric('Correlation model', returnModel.correlationModel),
        toMetric('Volatility scale', returnModel.volatilityScale),
        toMetric('Cash yield rate', returnModel.cashYieldRate),
      )
      if (marketTotals) {
        checkpoints.push(
          toMetric('Cash return', marketTotals.cash),
          toMetric('Holding return', marketTotals.holdings),
          toMetric('Total return', marketTotals.total),
        )
      }
      break
    }
    default: {
      break
    }
  }

  return {
    inputs: inputs.length > 0 ? inputs : undefined,
    checkpoints: checkpoints.length > 0 ? checkpoints : undefined,
  }
}

export const runSimulation = (input: SimulationInput): SimulationResult => {
  const { snapshot, settings } = input
  const modules = createSimulationModules(snapshot, settings)
  modules.forEach((module) => module.buildPlan?.(snapshot, settings))

  const state = createInitialState(snapshot)
  const monthlyTimeline: MonthlyRecord[] = []
  const timeline: YearRecord[] = []
  const explanations: MonthExplanation[] = []

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
    const stateBeforeCashflows = cloneState(state)
    const cashflowsByModule = modules.map((module) => ({
      moduleId: module.id,
      cashflows: module.getCashflows?.(state, context) ?? [],
    }))
    const cashflows = cashflowsByModule.flatMap((entry) => entry.cashflows)
    applyCashflows(state, cashflows, monthTotals)
    const stateAfterCashflows = cloneState(state)

    const intentsByModule = modules.map((module) => ({
      moduleId: module.id,
      intents: (module.getActionIntents?.(state, context) ?? []).map((intent) => ({
        ...intent,
        moduleId: module.id,
      })),
    }))
    const intents = intentsByModule.flatMap((entry) => entry.intents)
    const actions = resolveIntents(intents, state)
    applyActions(state, actions, monthTotals, context)

    const cashflowsByModuleId = new Map<string, CashflowItem[]>()
    cashflowsByModule.forEach((entry) => {
      cashflowsByModuleId.set(entry.moduleId, entry.cashflows)
    })

    const actionsByModuleId = new Map<string, ActionRecordWithModule[]>()
    actions.forEach((action) => {
      const list = actionsByModuleId.get(action.moduleId) ?? []
      list.push(action)
      actionsByModuleId.set(action.moduleId, list)
    })

    const marketReturnsByModuleId = new Map<string, MarketReturn[]>()
    modules.forEach((module) => {
      if (!module.onEndOfMonth) {
        return
      }
      if (module.id === 'returns-core') {
        const beforeCash = new Map(
          state.cashAccounts.map((account) => [account.id, account.balance]),
        )
        const beforeHoldings = new Map(
          state.holdings.map((holding) => [holding.id, holding.balance]),
        )
        module.onEndOfMonth(state, context)
        const marketReturns = buildMarketReturns(state, beforeCash, beforeHoldings)
        marketReturnsByModuleId.set(module.id, marketReturns)
        return
      }
      module.onEndOfMonth(state, context)
    })

    const moduleRuns: ModuleRunExplanation[] = modules.map((module) => {
      const moduleCashflows = cashflowsByModuleId.get(module.id) ?? []
      const moduleActionsWithModule = actionsByModuleId.get(module.id) ?? []
      const moduleActions = moduleActionsWithModule.map(({ moduleId: _moduleId, ...action }) => action)
      const moduleMarketReturns = marketReturnsByModuleId.get(module.id) ?? []
      const cashflowTotals = sumCashflowTotals(moduleCashflows)
      const actionTotals = sumActionTotals(moduleActions)
      const marketTotals =
        moduleMarketReturns.length > 0 ? sumMarketTotals(moduleMarketReturns) : undefined
      const stateForExplain = module.id === 'spending' ? stateBeforeCashflows : stateAfterCashflows
      const { inputs, checkpoints } = buildModuleExplain({
        moduleId: module.id,
        snapshot,
        state: stateForExplain,
        context,
        cashflows: moduleCashflows,
        actions: moduleActions,
        cashflowTotals,
        marketTotals,
      })
      return {
        moduleId: module.id,
        cashflows: moduleCashflows,
        actions: moduleActions,
        marketReturns: moduleMarketReturns.length > 0 ? moduleMarketReturns : undefined,
        totals: {
          cashflows: cashflowTotals,
          actions: actionTotals,
          market: marketTotals,
        },
        inputs,
        checkpoints,
      }
    })

    explanations.push({
      monthIndex,
      date: dateIso,
      modules: moduleRuns,
      accounts: buildAccountBalances(state),
    })

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
    explanations,
    summary: {
      endingBalance,
      minBalance: Number.isFinite(minBalance) ? minBalance : 0,
      maxBalance: Number.isFinite(maxBalance) ? maxBalance : 0,
    },
  }
}
