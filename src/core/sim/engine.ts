import type {
  AccountBalanceSnapshot,
  MarketReturn,
  ModuleRunExplanation,
  MonthExplanation,
  Person,
  SimulationResult,
} from '../models'
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

const sumContributionBasisEntries = (
  entries: SimulationState['holdings'][number]['contributionBasisEntries'],
) => entries.reduce((sum, entry) => sum + entry.amount, 0)

const scaleContributionBasisEntries = (
  entries: SimulationState['holdings'][number]['contributionBasisEntries'],
  ratio: number,
) =>
  entries
    .map((entry) => ({ ...entry, amount: Math.max(0, entry.amount * ratio) }))
    .filter((entry) => entry.amount > 0)

const consumeContributionBasisEntries = (
  entries: SimulationState['holdings'][number]['contributionBasisEntries'],
  amount: number,
  order: 'fifo' | 'lifo',
) => {
  if (amount <= 0 || entries.length === 0) {
    return { used: 0, entries }
  }
  const sorted = [...entries].sort((a, b) =>
    order === 'fifo' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
  )
  let remaining = amount
  const updated: typeof entries = []
  let used = 0
  sorted.forEach((entry) => {
    if (remaining <= 0) {
      updated.push(entry)
      return
    }
    const applied = Math.min(remaining, entry.amount)
    used += applied
    remaining -= applied
    const leftover = entry.amount - applied
    if (leftover > 0) {
      updated.push({ ...entry, amount: leftover })
    }
  })
  return { used, entries: updated }
}

const sumSeasonedBasis = (
  entries: SimulationState['holdings'][number]['contributionBasisEntries'],
  dateIso: string,
) => {
  const current = new Date(`${dateIso}T00:00:00Z`)
  if (Number.isNaN(current.getTime())) {
    return 0
  }
  return entries.reduce((sum, entry) => {
    const entryDate = new Date(`${entry.date}T00:00:00Z`)
    if (Number.isNaN(entryDate.getTime())) {
      return sum
    }
    let months =
      (current.getUTCFullYear() - entryDate.getUTCFullYear()) * 12 +
      (current.getUTCMonth() - entryDate.getUTCMonth())
    if (current.getUTCDate() < entryDate.getUTCDate()) {
      months -= 1
    }
    return months >= 60 ? sum + entry.amount : sum
  }, 0)
}

const addContributionBasisEntry = (
  holding: SimulationState['holdings'][number],
  amount: number,
  dateIso: string,
) => {
  if (amount <= 0) {
    return
  }
  holding.contributionBasisEntries.push({ date: dateIso, amount })
}

const buildAccountBalances = (
  state: SimulationState,
  dateIso: string,
): AccountBalanceSnapshot[] => [
  ...state.cashAccounts.map((account) => ({
    id: account.id,
    kind: 'cash' as const,
    balance: account.balance,
  })),
  ...state.holdings.map((holding) => {
    if (holding.taxType !== 'roth') {
      return {
        id: holding.id,
        kind: 'holding' as const,
        balance: holding.balance,
        investmentAccountId: holding.investmentAccountId,
      }
    }
    const totalBasis = sumContributionBasisEntries(holding.contributionBasisEntries)
    const seasonedBasis = sumSeasonedBasis(holding.contributionBasisEntries, dateIso)
    const cappedTotal = Math.min(holding.balance, Math.max(0, totalBasis))
    const cappedSeasoned = Math.min(cappedTotal, Math.max(0, seasonedBasis))
    const unseasoned = Math.max(0, cappedTotal - cappedSeasoned)
    return {
      id: holding.id,
      kind: 'holding' as const,
      balance: holding.balance,
      investmentAccountId: holding.investmentAccountId,
      basisSeasoned: cappedSeasoned,
      basisUnseasoned: unseasoned,
    }
  }),
]

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
    contributionBasisEntries: holding.contributionBasisEntries.map((entry) => ({ ...entry })),
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
      earnedIncome: 0,
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
    const withdrawal = Math.min(available, -remaining)
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
      const amount = -flow.cash
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
    if (flow.category === 'work' && flow.cash > 0) {
      state.yearLedger.earnedIncome += flow.cash
    }
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
  const seasonedRothBasis =
    holding.taxType === 'roth'
      ? sumSeasonedBasis(holding.contributionBasisEntries, context.dateIso)
      : 0
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
    const totalBasis = sumContributionBasisEntries(holding.contributionBasisEntries)
    let basisUsed = 0
    if (basisMethod === 'average') {
      const basisRatio = startingBalance > 0 ? totalBasis / startingBalance : 0
      basisUsed = withdrawal * basisRatio
      if (basisRatio > 0 && startingBalance > 0) {
        const scale = Math.max(0, (startingBalance - withdrawal) / startingBalance)
        holding.contributionBasisEntries = scaleContributionBasisEntries(
          holding.contributionBasisEntries,
          scale,
        )
      }
    } else {
      const { used, entries } = consumeContributionBasisEntries(
        holding.contributionBasisEntries,
        withdrawal,
        basisMethod === 'fifo' ? 'fifo' : 'lifo',
      )
      basisUsed = used
      holding.contributionBasisEntries = entries
    }
    const gain = Math.max(0, withdrawal - basisUsed)
    state.yearLedger.capitalGains += gain
    totals.capitalGains += gain
  } else if (holding.taxType === 'traditional') {
    state.yearLedger.ordinaryIncome += withdrawal
    totals.ordinaryIncome += withdrawal
  } else if (holding.taxType === 'roth') {
    holding.contributionBasisEntries = consumeContributionBasisEntries(
      holding.contributionBasisEntries,
      withdrawal,
      'fifo',
    ).entries
    state.yearLedger.taxExemptIncome += withdrawal
  } else {
    state.yearLedger.taxExemptIncome += withdrawal
  }

  const early = context.snapshot.scenario.strategies.earlyRetirement
  let penaltyAmount = 0
  if (!skipPenalty && context.age < 59.5) {
    if (holding.taxType === 'traditional' && !early.use72t) {
      penaltyAmount = withdrawal
    }
    if (holding.taxType === 'roth') {
      penaltyAmount = Math.max(0, withdrawal - seasonedRothBasis)
    }
  }
  if (penaltyAmount > 0) {
    state.yearLedger.penalties += penaltyAmount * early.penaltyRate
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
          addContributionBasisEntry(holding, action.resolvedAmount, context.dateIso)
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
          addContributionBasisEntry(holding, applied, context.dateIso)
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
  const holdingTaxTypeById = new Map(
    snapshot.investmentAccountHoldings.map((holding) => [holding.id, holding.taxType]),
  )
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
        earnedIncome: 0,
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

    modules.forEach((module) => module.explain?.reset())

    if (isStartOfYear) {
      modules.forEach((module) => module.onStartOfYear?.(state, context))
    }
    modules.forEach((module) => module.onStartOfMonth?.(state, context))

    const monthTotals = createEmptyTotals()
    const cashflowsByModule = modules.map((module) => ({
      moduleId: module.id,
      cashflows: module.getCashflows?.(state, context) ?? [],
    }))
    const cashflows = cashflowsByModule.flatMap((entry) => entry.cashflows)
    applyCashflows(state, cashflows, monthTotals)
    const extraCashflowsByModule = new Map<string, CashflowItem[]>()
    const extraCashflows = modules.flatMap((module) => {
      const extras = module.onAfterCashflows?.(cashflows, state, context) ?? []
      if (extras.length > 0) {
        extraCashflowsByModule.set(module.id, extras)
      }
      return extras
    })
    if (extraCashflows.length > 0) {
      applyCashflows(state, extraCashflows, monthTotals)
    }

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
    extraCashflowsByModule.forEach((extras, moduleId) => {
      const list = cashflowsByModuleId.get(moduleId) ?? []
      cashflowsByModuleId.set(moduleId, [...list, ...extras])
    })

    const actionsByModuleId = new Map<string, ActionRecord[]>()
    actions.forEach((action) => {
      const { moduleId, ...rest } = action
      const list = actionsByModuleId.get(moduleId) ?? []
      list.push(rest)
      actionsByModuleId.set(moduleId, list)
    })
    modules.forEach((module) => {
      const moduleActions = actionsByModuleId.get(module.id) ?? []
      module.onActionsResolved?.(moduleActions, state, context)
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
        module.onMarketReturns?.(marketReturns, state, context)
        return
      }
      module.onEndOfMonth(state, context)
    })

    const moduleRuns: ModuleRunExplanation[] = modules.map((module) => {
      const moduleCashflows = cashflowsByModuleId.get(module.id) ?? []
      const moduleActions = actionsByModuleId.get(module.id) ?? []
      const moduleMarketReturns = marketReturnsByModuleId.get(module.id) ?? []
      const cashflowTotals = sumCashflowTotals(moduleCashflows)
      const actionTotals = sumActionTotals(moduleActions)
      const marketTotals =
        moduleMarketReturns.length > 0 ? sumMarketTotals(moduleMarketReturns) : undefined
      const inputs = module.explain?.inputs ? [...module.explain.inputs] : undefined
      const checkpoints = module.explain?.checkpoints ? [...module.explain.checkpoints] : undefined
      const cashflowSeries =
        module.getCashflowSeries?.({
          moduleId: module.id,
          moduleLabel: module.id,
          cashflows: moduleCashflows,
          actions: moduleActions,
          marketTotal: marketTotals?.total,
          marketReturns: moduleMarketReturns,
          checkpoints,
          holdingTaxTypeById,
        }) ?? []
      return {
        moduleId: module.id,
        cashflows: moduleCashflows,
        actions: moduleActions,
        marketReturns: moduleMarketReturns.length > 0 ? moduleMarketReturns : undefined,
        cashflowSeries: cashflowSeries.length > 0 ? cashflowSeries : undefined,
        totals: {
          cashflows: cashflowTotals,
          actions: actionTotals,
          market: marketTotals,
        },
        inputs: inputs && inputs.length > 0 ? inputs : undefined,
        checkpoints: checkpoints && checkpoints.length > 0 ? checkpoints : undefined,
      }
    })

    explanations.push({
      monthIndex,
      date: dateIso,
      modules: moduleRuns,
      accounts: buildAccountBalances(state, dateIso),
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
