import type {
  InvestmentAccount,
  InvestmentAccountHolding,
  MarketReturn,
  SimulationSnapshot,
} from '../models'
import type { ModuleExplainTracker } from './explain'

export type SimCashAccount = {
  id: string
  balance: number
  interestRate: number
}

export type SimHolding = {
  id: string
  name: string
  investmentAccountId: string
  taxType: InvestmentAccountHolding['taxType']
  holdingType: InvestmentAccountHolding['holdingType']
  balance: number
  costBasisEntries: Array<{
    date: string
    amount: number
  }>
  returnRate: number
  returnStdDev: number
}

export type SimInvestmentAccount = {
  id: string
  contributionEntries: InvestmentAccount['contributionEntries']
}

export type SimulationSettings = {
  startDate: string
  endDate: string
  months: number
  stepMonths: number
  summaryOnly?: boolean
}

export type TaxLedger = {
  ordinaryIncome: number
  capitalGains: number
  deductions: number
  taxExemptIncome: number
  socialSecurityBenefits: number
  penalties: number
  taxPaid: number
  earnedIncome: number
}

export type CashflowCategory =
  | 'work'
  | 'spending_need'
  | 'spending_want'
  | 'social_security'
  | 'pension'
  | 'healthcare'
  | 'event'
  | 'charitable'
  | 'tax'
  | 'other'

export type CashflowItem = {
  id: string
  label: string
  category: CashflowCategory
  cash: number
  ordinaryIncome?: number
  capitalGains?: number
  deductions?: number
  taxExemptIncome?: number
  taxYear?: number
}

export type CashflowSeriesBucket = 'cash' | 'taxable' | 'traditional' | 'roth' | 'hsa'

export type CashflowSeriesEntry = {
  key: string
  label: string
  value: number
  bucket: CashflowSeriesBucket
}

export type ExplainMetric = {
  label: string
  value: string | number | boolean | null
}

export type ActionKind = 'withdraw' | 'deposit' | 'convert' | 'rebalance' | 'rmd'

export type ActionIntent = {
  id: string
  kind: ActionKind
  amount: number
  sourceHoldingId?: string
  targetHoldingId?: string
  fromCash?: boolean
  priority?: number
  label?: string
  taxTreatment?: 'ordinary' | 'capital_gains' | 'tax_exempt'
  skipPenalty?: boolean
}

export type ActionRecord = ActionIntent & {
  resolvedAmount: number
}

export type MonthlyRecord = {
  monthIndex: number
  date: string
  age: number
  cashBalance: number
  investmentBalance: number
  totalBalance: number
  income: number
  spending: number
  contributions: number
  withdrawals: number
  taxes: number
  ordinaryIncome: number
  capitalGains: number
  deductions: number
}

export type YearRecord = {
  yearIndex: number
  age: number
  date: string
  cashBalance: number
  investmentBalance: number
  totalBalance: number
  income: number
  spending: number
  contributions: number
  withdrawals: number
  taxes: number
  ledger: TaxLedger
}

export type SimulationState = {
  cashAccounts: SimCashAccount[]
  investmentAccounts: SimInvestmentAccount[]
  holdings: SimHolding[]
  yearLedger: TaxLedger
  pendingTaxDue: Array<{
    taxYear: number
    amount: number
    penalties: number
    taxableOrdinary: number
    taxableCapGains: number
  }>
  yearContributionsByTaxType: Record<CashflowSeriesBucket, number>
  magiHistory: Record<number, number>
  initialBalance: number
  guardrailTargetBalance: number | null
  guardrailTargetDateIso: string | null
  guardrailBaselineNeed: number
  guardrailBaselineWant: number
  guardrailGuytonMonthsRemaining: number
  guardrailFactorSum: number
  guardrailFactorMin: number
  guardrailFactorCount: number
  guardrailFactorBelowCount: number
}

export type SimulationContext = {
  snapshot: SimulationSnapshot
  settings: SimulationSettings
  monthIndex: number
  yearIndex: number
  age: number
  date: Date
  dateIso: string
  isStartOfYear: boolean
  isEndOfYear: boolean
  planMode: 'preview' | 'apply'
  summaryOnly: boolean
  yearPlan?: SimulationYearPlan
}

export type SimulationYearPlan = {
  conversionAmount?: number
}

export type SimulationModule = {
  id: string
  explain?: ModuleExplainTracker
  buildPlan?: (snapshot: SimulationSnapshot, settings: SimulationSettings) => void
  planYear?: (state: SimulationState, context: SimulationContext) => SimulationYearPlan | null
  onStartOfYear?: (state: SimulationState, context: SimulationContext) => void
  onStartOfMonth?: (state: SimulationState, context: SimulationContext) => void
  getCashflows?: (state: SimulationState, context: SimulationContext) => CashflowItem[]
  onAfterCashflows?: (
    cashflows: CashflowItem[],
    state: SimulationState,
    context: SimulationContext,
  ) => CashflowItem[]
  getActionIntents?: (state: SimulationState, context: SimulationContext) => ActionIntent[]
  onActionsResolved?: (actions: ActionRecord[], state: SimulationState, context: SimulationContext) => void
  onEndOfMonth?: (state: SimulationState, context: SimulationContext) => void
  onMarketReturns?: (
    marketReturns: MarketReturn[],
    state: SimulationState,
    context: SimulationContext,
  ) => void
  onEndOfYear?: (state: SimulationState, context: SimulationContext) => void
  getCashflowSeries?: (context: {
    moduleId: string
    moduleLabel: string
    cashflows: CashflowItem[]
    actions: ActionRecord[]
    marketTotal?: number
    marketReturns?: MarketReturn[]
    checkpoints?: ExplainMetric[]
    holdingTaxTypeById: Map<string, InvestmentAccountHolding['taxType']>
  }) => CashflowSeriesEntry[]
}
