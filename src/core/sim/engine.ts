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
  SimulationModule,
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

const sumCostBasisEntries = (entries: SimulationState['holdings'][number]['costBasisEntries']) =>
  entries.reduce((sum, entry) => sum + entry.amount, 0)

const scaleCostBasisEntries = (
  entries: SimulationState['holdings'][number]['costBasisEntries'],
  ratio: number,
) =>
  entries
    .map((entry) => ({ ...entry, amount: Math.max(0, entry.amount * ratio) }))
    .filter((entry) => entry.amount > 0)

const consumeCostBasisEntries = (
  entries: SimulationState['holdings'][number]['costBasisEntries'],
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

const sumSeasonedEntries = (entries: Array<{ date: string; amount: number }>, dateIso: string) => {
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

const addCostBasisEntry = (
  holding: SimulationState['holdings'][number],
  amount: number,
  dateIso: string,
) => {
  if (amount <= 0) {
    return
  }
  holding.costBasisEntries.push({ date: dateIso, amount })
}

const getAccountContributionEntries = (
  state: SimulationState,
  accountId: string,
) =>
  state.investmentAccounts.find((account) => account.id === accountId)?.contributionEntries ??
  []

const addAccountContributionEntry = (
  state: SimulationState,
  accountId: string,
  amount: number,
  dateIso: string,
  taxType: SimulationState['holdings'][number]['taxType'],
) => {
  if (amount <= 0) {
    return
  }
  const account = state.investmentAccounts.find((entry) => entry.id === accountId)
  if (!account) {
    return
  }
  account.contributionEntries.push({ date: dateIso, amount, taxType })
}

const sumAccountContributionEntries = (
  entries: SimulationState['investmentAccounts'][number]['contributionEntries'],
  taxType: SimulationState['holdings'][number]['taxType'],
) => entries.filter((entry) => entry.taxType === taxType)

const sumSeasonedContributions = (
  entries: SimulationState['investmentAccounts'][number]['contributionEntries'],
  dateIso: string,
  taxType: SimulationState['holdings'][number]['taxType'],
) => sumSeasonedEntries(sumAccountContributionEntries(entries, taxType), dateIso)

const sumContributionAmounts = (
  entries: SimulationState['investmentAccounts'][number]['contributionEntries'],
  taxType: SimulationState['holdings'][number]['taxType'],
) => sumAccountContributionEntries(entries, taxType).reduce((sum, entry) => sum + entry.amount, 0)

const consumeAccountContributionEntries = (
  entries: SimulationState['investmentAccounts'][number]['contributionEntries'],
  amount: number,
  order: 'fifo' | 'lifo',
  taxType: SimulationState['holdings'][number]['taxType'],
) => {
  if (amount <= 0) {
    return { used: 0, entries }
  }
  const matching = entries.filter((entry) => entry.taxType === taxType)
  if (matching.length === 0) {
    return { used: 0, entries }
  }
  const sorted = [...matching].sort((a, b) =>
    order === 'fifo' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
  )
  let remaining = amount
  const updated: typeof matching = []
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
  const nonMatching = entries.filter((entry) => entry.taxType !== taxType)
  return { used, entries: [...nonMatching, ...updated] }
}

const buildAccountBalances = (
  state: SimulationState,
  dateIso: string,
): AccountBalanceSnapshot[] => {
  const rothHoldingsByAccount = new Map<string, SimulationState['holdings']>()
  state.holdings.forEach((holding) => {
    if (holding.taxType !== 'roth') {
      return
    }
    const list = rothHoldingsByAccount.get(holding.investmentAccountId) ?? []
    list.push(holding)
    rothHoldingsByAccount.set(holding.investmentAccountId, list)
  })

  const rothBasisByAccount = new Map<
    string,
    { balance: number; totalBasis: number; seasonedBasis: number }
  >()
  rothHoldingsByAccount.forEach((holdings, accountId) => {
    const balance = holdings.reduce((sum, holding) => sum + holding.balance, 0)
    const entries = getAccountContributionEntries(state, accountId)
    const totalBasis = sumContributionAmounts(entries, 'roth')
    const seasonedBasis = sumSeasonedContributions(entries, dateIso, 'roth')
    const cappedTotal = Math.min(balance, Math.max(0, totalBasis))
    const cappedSeasoned = Math.min(cappedTotal, Math.max(0, seasonedBasis))
    rothBasisByAccount.set(accountId, {
      balance,
      totalBasis: cappedTotal,
      seasonedBasis: cappedSeasoned,
    })
  })

  return [
    ...state.cashAccounts.map((account) => ({
      id: account.id,
      kind: 'cash' as const,
      balance: account.balance,
    })),
    ...state.holdings.map((holding) => {
      const costBasis = sumCostBasisEntries(holding.costBasisEntries)
      if (holding.taxType !== 'roth') {
        return {
          id: holding.id,
          kind: 'holding' as const,
          name: holding.name,
          balance: holding.balance,
          investmentAccountId: holding.investmentAccountId,
          taxType: holding.taxType,
          holdingType: holding.holdingType,
          costBasis,
        }
      }
      const basis = rothBasisByAccount.get(holding.investmentAccountId)
      const ratio =
        basis && basis.balance > 0 ? holding.balance / basis.balance : 0
      const holdingTotal = (basis?.totalBasis ?? 0) * ratio
      const holdingSeasoned = (basis?.seasonedBasis ?? 0) * ratio
      const unseasoned = Math.max(0, holdingTotal - holdingSeasoned)
      return {
        id: holding.id,
        kind: 'holding' as const,
        name: holding.name,
        balance: holding.balance,
        investmentAccountId: holding.investmentAccountId,
        taxType: holding.taxType,
        holdingType: holding.holdingType,
        costBasis,
        basisSeasoned: holdingSeasoned,
        basisUnseasoned: unseasoned,
      }
    }),
  ]
}

const buildContributionTotals = (state: SimulationState, dateIso: string) => {
  const totals = {
    taxable: 0,
    traditional: 0,
    roth: 0,
    hsa: 0,
  }
  state.investmentAccounts.forEach((account) => {
    account.contributionEntries.forEach((entry) => {
      if (entry.date && entry.date <= dateIso) {
        totals[entry.taxType] += entry.amount
      }
    })
  })
  return totals
}

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
  const investmentAccounts = snapshot.investmentAccounts.map((account) => {
    const baseEntries = account.contributionEntries ?? []
    // Legacy fallback: treat Roth holding cost basis entries as contributions.
    const fallbackEntries =
      baseEntries.length > 0
        ? baseEntries
        : snapshot.investmentAccountHoldings
            .filter(
              (holding) =>
                holding.investmentAccountId === account.id && holding.taxType === 'roth',
            )
            .flatMap((holding) =>
              holding.costBasisEntries.map((entry) => ({
                ...entry,
                taxType: 'roth' as const,
              })),
            )
    return {
      id: account.id,
      contributionEntries: fallbackEntries.map((entry) => ({ ...entry })),
    }
  })
  const holdings = snapshot.investmentAccountHoldings.map((holding) => ({
    id: holding.id,
    name: holding.name,
    investmentAccountId: holding.investmentAccountId,
    taxType: holding.taxType,
    holdingType: holding.holdingType,
    balance: holding.balance,
    costBasisEntries: holding.costBasisEntries.map((entry) => ({ ...entry })),
    returnRate: holding.returnRate,
    returnStdDev: holding.returnStdDev,
  }))
  const initialBalance =
    cashAccounts.reduce((sum, account) => sum + account.balance, 0) +
    holdings.reduce((sum, holding) => sum + holding.balance, 0)
  return {
    cashAccounts,
    investmentAccounts,
    holdings,
    yearLedger: {
      ordinaryIncome: 0,
      capitalGains: 0,
      deductions: 0,
      taxExemptIncome: 0,
      socialSecurityBenefits: 0,
      penalties: 0,
      taxPaid: 0,
      earnedIncome: 0,
    },
    pendingTaxDue: [],
    yearContributionsByTaxType: {
      cash: 0,
      taxable: 0,
      traditional: 0,
      roth: 0,
      hsa: 0,
    },
    magiHistory: {},
    initialBalance,
    guardrailTargetBalance: null,
    guardrailTargetDateIso: null,
    guardrailBaselineNeed: 0,
    guardrailBaselineWant: 0,
    guardrailGuytonMonthsRemaining: 0,
    guardrailFactorSum: 0,
    guardrailFactorMin: Number.POSITIVE_INFINITY,
    guardrailFactorCount: 0,
    guardrailFactorBelowCount: 0,
  }
}

const cloneState = (state: SimulationState): SimulationState => ({
  cashAccounts: state.cashAccounts.map((account) => ({ ...account })),
  investmentAccounts: state.investmentAccounts.map((account) => ({
    ...account,
    contributionEntries: account.contributionEntries.map((entry) => ({ ...entry })),
  })),
  holdings: state.holdings.map((holding) => ({
    ...holding,
    name: holding.name,
    costBasisEntries: holding.costBasisEntries.map((entry) => ({ ...entry })),
  })),
  yearLedger: { ...state.yearLedger },
  pendingTaxDue: state.pendingTaxDue.map((entry) => ({ ...entry })),
  yearContributionsByTaxType: { ...state.yearContributionsByTaxType },
  magiHistory: { ...state.magiHistory },
  initialBalance: state.initialBalance,
  guardrailTargetBalance: state.guardrailTargetBalance,
  guardrailTargetDateIso: state.guardrailTargetDateIso,
  guardrailBaselineNeed: state.guardrailBaselineNeed,
  guardrailBaselineWant: state.guardrailBaselineWant,
  guardrailGuytonMonthsRemaining: state.guardrailGuytonMonthsRemaining,
  guardrailFactorSum: state.guardrailFactorSum,
  guardrailFactorMin: state.guardrailFactorMin,
  guardrailFactorCount: state.guardrailFactorCount,
  guardrailFactorBelowCount: state.guardrailFactorBelowCount,
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
    if (flow.category === 'social_security') {
      state.yearLedger.socialSecurityBenefits += flow.cash
    }
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
  skipRothContributionConsumption?: boolean,
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
  const accountContributionEntries =
    holding.taxType === 'roth'
      ? getAccountContributionEntries(state, holding.investmentAccountId)
      : []
  const seasonedRothBasis =
    holding.taxType === 'roth'
      ? sumSeasonedContributions(accountContributionEntries, context.dateIso, 'roth')
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
    const totalBasis = sumCostBasisEntries(holding.costBasisEntries)
    let basisUsed = 0
    if (basisMethod === 'average') {
      const basisRatio = startingBalance > 0 ? totalBasis / startingBalance : 0
      basisUsed = withdrawal * basisRatio
      if (basisRatio > 0 && startingBalance > 0) {
        const scale = Math.max(0, (startingBalance - withdrawal) / startingBalance)
        holding.costBasisEntries = scaleCostBasisEntries(
          holding.costBasisEntries,
          scale,
        )
      }
    } else {
      const { used, entries } = consumeCostBasisEntries(
        holding.costBasisEntries,
        withdrawal,
        basisMethod === 'fifo' ? 'fifo' : 'lifo',
      )
      basisUsed = used
      holding.costBasisEntries = entries
    }
    const gain = Math.max(0, withdrawal - basisUsed)
    state.yearLedger.capitalGains += gain
    totals.capitalGains += gain
  } else if (holding.taxType === 'traditional') {
    state.yearLedger.ordinaryIncome += withdrawal
    totals.ordinaryIncome += withdrawal
  } else if (holding.taxType === 'roth') {
    if (!skipRothContributionConsumption) {
      const account = state.investmentAccounts.find(
        (entry) => entry.id === holding.investmentAccountId,
      )
      if (account) {
        account.contributionEntries = consumeAccountContributionEntries(
          account.contributionEntries,
          withdrawal,
          'fifo',
          'roth',
        ).entries
      }
    }
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

const applyHoldingRebalance = (
  state: SimulationState,
  sourceHoldingId: string,
  targetHoldingId: string,
  amount: number,
  totals: MonthTotals,
  context: SimulationContext,
) => {
  if (!sourceHoldingId || !targetHoldingId || amount <= 0) {
    return 0
  }
  const source = state.holdings.find((entry) => entry.id === sourceHoldingId)
  const target = state.holdings.find((entry) => entry.id === targetHoldingId)
  if (!source || !target || source.id === target.id) {
    return 0
  }
  const startingBalance = source.balance
  const applied = Math.min(amount, source.balance)
  if (applied <= 0) {
    return 0
  }
  source.balance -= applied

  if (source.taxType === 'taxable') {
    const basisMethod = context.snapshot.scenario.strategies.taxableLot.costBasisMethod
    const totalBasis = sumCostBasisEntries(source.costBasisEntries)
    let basisUsed = 0
    if (basisMethod === 'average') {
      const basisRatio = startingBalance > 0 ? totalBasis / startingBalance : 0
      basisUsed = applied * basisRatio
      if (basisRatio > 0 && startingBalance > 0) {
        const scale = Math.max(0, (startingBalance - applied) / startingBalance)
        source.costBasisEntries = scaleCostBasisEntries(source.costBasisEntries, scale)
      }
    } else {
      const { used, entries } = consumeCostBasisEntries(
        source.costBasisEntries,
        applied,
        basisMethod === 'fifo' ? 'fifo' : 'lifo',
      )
      basisUsed = used
      source.costBasisEntries = entries
    }
    const gain = Math.max(0, applied - basisUsed)
    state.yearLedger.capitalGains += gain
    totals.capitalGains += gain
  }

  target.balance += applied
  addCostBasisEntry(target, applied, context.dateIso)
  return applied
}

const withdrawProRata = (
  state: SimulationState,
  amount: number,
  totals: MonthTotals,
  context: SimulationContext,
  taxTreatmentOverride?: ActionIntent['taxTreatment'],
  skipPenalty?: boolean,
  skipRothContributionConsumption?: boolean,
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
      skipRothContributionConsumption,
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
    if (intent.kind === 'withdraw' || intent.kind === 'rebalance') {
      const available = intent.sourceHoldingId
        ? state.holdings.find((holding) => holding.id === intent.sourceHoldingId)?.balance ?? 0
        : sumHoldings(state)
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
  const shouldTrackAccountContribution = (action: ActionRecordWithModule) =>
    action.moduleId === 'work' || action.moduleId === 'cashBuffer'

  actions.forEach((action) => {
    if (action.kind === 'rebalance') {
      if (!action.sourceHoldingId || !action.targetHoldingId) {
        return
      }
      applyHoldingRebalance(
        state,
        action.sourceHoldingId,
        action.targetHoldingId,
        action.resolvedAmount,
        totals,
        context,
      )
      return
    }
    if (action.kind === 'withdraw') {
      const skipPenalty = action.skipPenalty || action.moduleId === 'rebalancing'
      const skipRothContributionConsumption = action.moduleId === 'rebalancing'
      const applied =
        action.sourceHoldingId
          ? applyHoldingWithdrawal(
              state,
              action.sourceHoldingId,
              action.resolvedAmount,
              totals,
              context,
              action.taxTreatment,
              skipPenalty,
              skipRothContributionConsumption,
            )
          : withdrawProRata(
              state,
              action.resolvedAmount,
              totals,
              context,
              action.taxTreatment,
              skipPenalty,
              skipRothContributionConsumption,
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
          addCostBasisEntry(holding, action.resolvedAmount, context.dateIso)
          if (shouldTrackAccountContribution(action)) {
            addAccountContributionEntry(
              state,
              holding.investmentAccountId,
              action.resolvedAmount,
              context.dateIso,
              holding.taxType,
            )
          }
          if (action.fromCash !== false) {
            const bucket = holding.taxType
            state.yearContributionsByTaxType[bucket] += action.resolvedAmount
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
          addCostBasisEntry(holding, applied, context.dateIso)
          addAccountContributionEntry(
            state,
            holding.investmentAccountId,
            applied,
            context.dateIso,
            holding.taxType,
          )
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
    ledger: { ...state.yearLedger },
  }
}

export const runSimulation = (input: SimulationInput): SimulationResult => {
  const { snapshot, settings } = input
  const previewModules = createSimulationModules(snapshot, settings)
  const runModules = createSimulationModules(snapshot, settings)
  const holdingTaxTypeById = new Map(
    snapshot.investmentAccountHoldings.map((holding) => [holding.id, holding.taxType]),
  )
  previewModules.forEach((module) => module.buildPlan?.(snapshot, settings))
  runModules.forEach((module) => module.buildPlan?.(snapshot, settings))

  let state = createInitialState(snapshot)
  const monthlyTimeline: MonthlyRecord[] = []
  const timeline: YearRecord[] = []
  const explanations: MonthExplanation[] = []

  const primaryPerson = getPrimaryPerson(snapshot)
  const start = new Date(settings.startDate)
  const totalMonths = settings.months
  let minBalance = Number.POSITIVE_INFINITY
  let maxBalance = Number.NEGATIVE_INFINITY

  const runYearPass = ({
    startMonthIndex,
    monthsInYear,
    yearIndex,
    planMode,
    yearPlan,
    record,
    modules,
  }: {
    startMonthIndex: number
    monthsInYear: number
    yearIndex: number
    planMode: SimulationContext['planMode']
    yearPlan?: SimulationContext['yearPlan']
    record: boolean
    modules: SimulationModule[]
  }) => {
    let yearTotals = createEmptyTotals()
    for (let offset = 0; offset < monthsInYear; offset += settings.stepMonths) {
      const monthIndex = startMonthIndex + offset
      const date = addMonths(start, monthIndex)
      const dateIso = toIsoDate(date)
      const isStartOfYear = offset === 0
      const isEndOfYear = offset + settings.stepMonths >= monthsInYear
      const age = primaryPerson
        ? getAgeInYearsAtDate(primaryPerson.dateOfBirth, dateIso)
        : yearIndex

      if (isStartOfYear) {
        state.yearLedger = {
          ordinaryIncome: 0,
          capitalGains: 0,
          deductions: 0,
          taxExemptIncome: 0,
          socialSecurityBenefits: 0,
          penalties: 0,
          taxPaid: 0,
          earnedIncome: 0,
        }
        state.yearContributionsByTaxType = {
          cash: 0,
          taxable: 0,
          traditional: 0,
          roth: 0,
          hsa: 0,
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
        planMode,
        yearPlan,
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
          if (record) {
            module.onMarketReturns?.(marketReturns, state, context)
          }
          return
        }
        module.onEndOfMonth(state, context)
      })

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

      if (record) {
        const moduleRuns: ModuleRunExplanation[] = modules.map((module) => {
          const moduleCashflows = cashflowsByModuleId.get(module.id) ?? []
          const moduleActions = actionsByModuleId.get(module.id) ?? []
          const moduleMarketReturns = marketReturnsByModuleId.get(module.id) ?? []
          const cashflowTotals = sumCashflowTotals(moduleCashflows)
          const actionTotals = sumActionTotals(moduleActions)
          const marketTotals =
            moduleMarketReturns.length > 0 ? sumMarketTotals(moduleMarketReturns) : undefined
          const inputs = module.explain?.inputs ? [...module.explain.inputs] : undefined
          const checkpoints = module.explain?.checkpoints
            ? [...module.explain.checkpoints]
            : undefined
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
          contributionTotals: buildContributionTotals(state, dateIso),
        })

        const monthRecord = buildMonthlyRecord(monthIndex, dateIso, age, monthTotals, state)
        monthlyTimeline.push(monthRecord)

        const totalBalance = monthRecord.totalBalance
        minBalance = Math.min(minBalance, totalBalance)
        maxBalance = Math.max(maxBalance, totalBalance)
      }

      if (isEndOfYear) {
        modules.forEach((module) => module.onEndOfYear?.(state, context))
        if (record) {
          const yearRecord = buildYearRecord(yearIndex, age, dateIso, yearTotals, state)
          timeline.push(yearRecord)
        }
      }
    }
  }

  const totalYears = Math.ceil(totalMonths / 12)
  for (let yearIndex = 0; yearIndex < totalYears; yearIndex += 1) {
    const startMonthIndex = yearIndex * 12
    if (startMonthIndex >= totalMonths) {
      break
    }
    const monthsInYear = Math.min(12, totalMonths - startMonthIndex)
    const yearStartState = cloneState(state)
    const yearStartDate = addMonths(start, startMonthIndex)
    const yearStartIso = toIsoDate(yearStartDate)
    const yearStartAge = primaryPerson
      ? getAgeInYearsAtDate(primaryPerson.dateOfBirth, yearStartIso)
      : yearIndex
    const yearStartContext: SimulationContext = {
      snapshot,
      settings,
      monthIndex: startMonthIndex,
      yearIndex,
      age: yearStartAge,
      date: yearStartDate,
      dateIso: yearStartIso,
      isStartOfYear: true,
      isEndOfYear: monthsInYear <= settings.stepMonths,
      planMode: 'preview',
    }

    runYearPass({
      startMonthIndex,
      monthsInYear,
      yearIndex,
      planMode: 'preview',
      record: false,
      modules: previewModules,
    })

    const yearPlan = runModules.reduce<SimulationContext['yearPlan']>(
      (plan, module) => {
        const next = module.planYear?.(state, yearStartContext)
        return next ? { ...plan, ...next } : plan
      },
      {},
    )

    state = cloneState(yearStartState)
    runYearPass({
      startMonthIndex,
      monthsInYear,
      yearIndex,
      planMode: 'apply',
      yearPlan,
      record: true,
      modules: runModules,
    })
  }

  const endingBalance =
    monthlyTimeline.length > 0 ? monthlyTimeline[monthlyTimeline.length - 1].totalBalance : 0
  const guardrailCount = state.guardrailFactorCount
  const guardrailAvg =
    guardrailCount > 0 ? state.guardrailFactorSum / guardrailCount : 1
  const guardrailMin =
    guardrailCount > 0 && Number.isFinite(state.guardrailFactorMin)
      ? state.guardrailFactorMin
      : 1
  const guardrailPctBelow =
    guardrailCount > 0 ? state.guardrailFactorBelowCount / guardrailCount : 0

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
      ledger: point.ledger,
    })),
    monthlyTimeline,
    explanations,
    summary: {
      endingBalance,
      minBalance: Number.isFinite(minBalance) ? minBalance : 0,
      maxBalance: Number.isFinite(maxBalance) ? maxBalance : 0,
      guardrailFactorAvg: guardrailAvg,
      guardrailFactorMin: guardrailMin,
      guardrailFactorBelowPct: guardrailPctBelow,
    },
  }
}
