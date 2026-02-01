import { z } from 'zod'
import { isoDateStringSchema } from './common'
import { holdingTypeSchema, taxTypeSchema } from './enums'
import { simulationSnapshotSchema } from './simulationSnapshot'

const cashflowCategorySchema = z.enum([
  'work',
  'spending_need',
  'spending_want',
  'social_security',
  'pension',
  'healthcare',
  'event',
  'charitable',
  'tax',
  'other',
])

const cashflowItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: cashflowCategorySchema,
  cash: z.number(),
  ordinaryIncome: z.number().optional(),
  capitalGains: z.number().optional(),
  deductions: z.number().optional(),
  taxExemptIncome: z.number().optional(),
})

const actionKindSchema = z.enum(['withdraw', 'deposit', 'convert', 'rebalance', 'rmd'])

const actionRecordSchema = z.object({
  id: z.string(),
  kind: actionKindSchema,
  amount: z.number(),
  resolvedAmount: z.number(),
  sourceHoldingId: z.string().optional(),
  targetHoldingId: z.string().optional(),
  fromCash: z.boolean().optional(),
  priority: z.number().optional(),
  label: z.string().optional(),
  taxTreatment: z.enum(['ordinary', 'capital_gains', 'tax_exempt']).optional(),
  skipPenalty: z.boolean().optional(),
})

const explainValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

const explainMetricSchema = z.object({
  label: z.string(),
  value: explainValueSchema,
})

const cashflowTotalsSchema = z.object({
  cash: z.number(),
  ordinaryIncome: z.number(),
  capitalGains: z.number(),
  deductions: z.number(),
  taxExemptIncome: z.number(),
})

const actionTotalsSchema = z.object({
  deposit: z.number(),
  withdraw: z.number(),
  convert: z.number(),
})

const marketTotalsSchema = z.object({
  cash: z.number(),
  holdings: z.number(),
  total: z.number(),
})

const marketReturnSchema = z.object({
  id: z.string(),
  kind: z.enum(['cash', 'holding']),
  balanceStart: z.number(),
  balanceEnd: z.number(),
  amount: z.number(),
  rate: z.number(),
  investmentAccountId: z.string().optional(),
  holdingType: z.string().optional(),
  taxType: z.string().optional(),
})

const accountBalanceSchema = z.object({
  id: z.string(),
  kind: z.enum(['cash', 'holding']),
  name: z.string().optional(),
  balance: z.number(),
  investmentAccountId: z.string().optional(),
  taxType: taxTypeSchema.optional(),
  holdingType: holdingTypeSchema.optional(),
  costBasis: z.number().optional(),
  basisSeasoned: z.number().optional(),
  basisUnseasoned: z.number().optional(),
})

const contributionTotalsSchema = z.object({
  taxable: z.number(),
  traditional: z.number(),
  roth: z.number(),
  hsa: z.number(),
})

const taxLedgerSchema = z.object({
  ordinaryIncome: z.number(),
  capitalGains: z.number(),
  deductions: z.number(),
  taxExemptIncome: z.number(),
  socialSecurityBenefits: z.number(),
  penalties: z.number(),
  taxPaid: z.number(),
  earnedIncome: z.number(),
})

const moduleRunSchema = z.object({
  moduleId: z.string(),
  cashflows: z.array(cashflowItemSchema),
  actions: z.array(actionRecordSchema),
  marketReturns: z.array(marketReturnSchema).optional(),
  cashflowSeries: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        value: z.number(),
        bucket: z.enum(['cash', 'taxable', 'traditional', 'roth', 'hsa']),
      }),
    )
    .optional(),
  totals: z.object({
    cashflows: cashflowTotalsSchema,
    actions: actionTotalsSchema,
    market: marketTotalsSchema.optional(),
  }),
  inputs: z.array(explainMetricSchema).optional(),
  checkpoints: z.array(explainMetricSchema).optional(),
})

const monthExplanationSchema = z.object({
  monthIndex: z.number().int().min(0),
  date: isoDateStringSchema,
  modules: z.array(moduleRunSchema),
  accounts: z.array(accountBalanceSchema),
  contributionTotals: contributionTotalsSchema.optional(),
})

export const timelinePointSchema = z.object({
  yearIndex: z.number().int().min(0),
  age: z.number(),
  balance: z.number(),
  contribution: z.number(),
  spending: z.number(),
  income: z.number().optional(),
  withdrawals: z.number().optional(),
  taxes: z.number().optional(),
  cashBalance: z.number().optional(),
  investmentBalance: z.number().optional(),
  date: isoDateStringSchema.optional(),
  ledger: taxLedgerSchema.optional(),
})

export const monthlyTimelinePointSchema = z.object({
  monthIndex: z.number().int().min(0),
  date: isoDateStringSchema,
  age: z.number(),
  cashBalance: z.number(),
  investmentBalance: z.number(),
  totalBalance: z.number(),
  income: z.number(),
  spending: z.number(),
  contributions: z.number(),
  withdrawals: z.number(),
  taxes: z.number(),
  ordinaryIncome: z.number(),
  capitalGains: z.number(),
  deductions: z.number(),
})

export const stochasticRunSummarySchema = z.object({
  runIndex: z.number().int().min(0),
  seed: z.number().int(),
  endingBalance: z.number(),
  minBalance: z.number(),
  maxBalance: z.number(),
  guardrailFactorAvg: z.number(),
  guardrailFactorMin: z.number(),
  guardrailFactorBelowPct: z.number(),
})

export const simulationResultSchema = z.object({
  timeline: z.array(timelinePointSchema),
  monthlyTimeline: z.array(monthlyTimelinePointSchema).optional(),
  explanations: z.array(monthExplanationSchema).optional(),
  stochasticRuns: z.array(stochasticRunSummarySchema).optional(),
  stochasticRunsCancelled: z.boolean().optional(),
  summary: z.object({
    endingBalance: z.number(),
    minBalance: z.number(),
    maxBalance: z.number(),
    guardrailFactorAvg: z.number(),
    guardrailFactorMin: z.number(),
    guardrailFactorBelowPct: z.number(),
  }),
})

export const simulationRunSchema = z.object({
  id: z.string().uuid(),
  scenarioId: z.string().uuid(),
  title: z.string().optional(),
  startedAt: z.number(),
  finishedAt: z.number(),
  status: z.enum(['success', 'error']),
  errorMessage: z.string().optional(),
  result: simulationResultSchema,
  snapshot: simulationSnapshotSchema.optional(),
})

export type SimulationResult = z.infer<typeof simulationResultSchema>
export type SimulationRun = z.infer<typeof simulationRunSchema>
export type CashflowItem = z.infer<typeof cashflowItemSchema>
export type ActionRecord = z.infer<typeof actionRecordSchema>
export type ExplainMetric = z.infer<typeof explainMetricSchema>
export type MarketReturn = z.infer<typeof marketReturnSchema>
export type AccountBalanceSnapshot = z.infer<typeof accountBalanceSchema>
export type ModuleRunExplanation = z.infer<typeof moduleRunSchema>
export type MonthExplanation = z.infer<typeof monthExplanationSchema>
export type StochasticRunSummary = z.infer<typeof stochasticRunSummarySchema>
