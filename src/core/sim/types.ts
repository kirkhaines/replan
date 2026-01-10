import type {
  ActionRecord,
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
  investmentAccountId: string
  taxType: InvestmentAccountHolding['taxType']
  holdingType: InvestmentAccountHolding['holdingType']
  balance: number
  contributionBasis: number
  returnRate: number
  returnStdDev: number
}

export type SimulationSettings = {
  startDate: string
  endDate: string
  months: number
  stepMonths: number
}

export type TaxLedger = {
  ordinaryIncome: number
  capitalGains: number
  deductions: number
  taxExemptIncome: number
  penalties: number
  taxPaid: number
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
}

export type SimulationState = {
  cashAccounts: SimCashAccount[]
  holdings: SimHolding[]
  yearLedger: TaxLedger
  magiHistory: Record<number, number>
  initialBalance: number
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
}

export type SimulationModule = {
  id: string
  explain?: ModuleExplainTracker
  buildPlan?: (snapshot: SimulationSnapshot, settings: SimulationSettings) => void
  onStartOfYear?: (state: SimulationState, context: SimulationContext) => void
  onStartOfMonth?: (state: SimulationState, context: SimulationContext) => void
  getCashflows?: (state: SimulationState, context: SimulationContext) => CashflowItem[]
  getActionIntents?: (state: SimulationState, context: SimulationContext) => ActionIntent[]
  onActionsResolved?: (actions: ActionRecord[], state: SimulationState, context: SimulationContext) => void
  onEndOfMonth?: (state: SimulationState, context: SimulationContext) => void
  onMarketReturns?: (
    marketReturns: MarketReturn[],
    state: SimulationState,
    context: SimulationContext,
  ) => void
  onEndOfYear?: (state: SimulationState, context: SimulationContext) => void
}
