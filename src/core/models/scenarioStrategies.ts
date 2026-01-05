import { z } from 'zod'
import { filingStatusSchema, inflationTypeSchema, taxTreatmentSchema, taxTypeSchema } from './enums'
import { isoDateStringSchema } from './common'

export const returnModelStrategySchema = z.object({
  mode: z.enum(['deterministic', 'stochastic', 'historical']),
  sequenceModel: z.enum(['independent', 'regime']),
  volatilityScale: z.number().min(0),
  correlationModel: z.enum(['none', 'asset_class']),
  cashYieldRate: z.number().min(0),
  seed: z.number().int().optional(),
})

export const allocationTargetSchema = z.object({
  age: z.number().min(0),
  equity: z.number().min(0),
  bonds: z.number().min(0),
  cash: z.number().min(0),
  realEstate: z.number().min(0),
  other: z.number().min(0),
})

export const glidepathStrategySchema = z.object({
  mode: z.enum(['age', 'year']),
  scope: z.enum(['global', 'per_account']),
  targets: z.array(allocationTargetSchema).min(1),
})

export const rebalancingStrategySchema = z.object({
  frequency: z.enum(['monthly', 'quarterly', 'annual', 'threshold']),
  driftThreshold: z.number().min(0).max(1),
  useContributions: z.boolean(),
  taxAware: z.boolean(),
  minTradeAmount: z.number().min(0),
})

export const cashBufferStrategySchema = z.object({
  targetMonths: z.number().min(0),
  minMonths: z.number().min(0),
  maxMonths: z.number().min(0),
  refillPriority: z.enum(['pro_rata', 'taxable_first', 'tax_deferred_first']),
})

export const withdrawalStrategySchema = z.object({
  order: z.array(taxTypeSchema).min(1),
  useCashFirst: z.boolean(),
  guardrailPct: z.number().min(0).max(1),
  avoidEarlyPenalty: z.boolean(),
  taxableGainHarvestTarget: z.number().min(0),
})

export const taxableLotStrategySchema = z.object({
  costBasisMethod: z.enum(['average', 'fifo', 'lifo']),
  harvestLosses: z.boolean(),
  gainRealizationTarget: z.number().min(0),
})

export const earlyRetirementStrategySchema = z.object({
  useRothBasisFirst: z.boolean(),
  allowPenalty: z.boolean(),
  penaltyRate: z.number().min(0).max(1),
  use72t: z.boolean(),
  bridgeCashYears: z.number().min(0),
})

export const rothConversionStrategySchema = z.object({
  enabled: z.boolean(),
  startAge: z.number().min(0),
  endAge: z.number().min(0),
  targetOrdinaryIncome: z.number().min(0),
  minConversion: z.number().min(0),
  maxConversion: z.number().min(0),
  respectIrmaa: z.boolean(),
})

export const rothLadderStrategySchema = z.object({
  enabled: z.boolean(),
  leadTimeYears: z.number().min(0),
  startAge: z.number().min(0),
  endAge: z.number().min(0),
  targetAfterTaxSpending: z.number().min(0),
  annualConversion: z.number().min(0),
})

export const rmdStrategySchema = z.object({
  enabled: z.boolean(),
  startAge: z.number().min(0),
  accountTypes: z.array(taxTypeSchema).min(1),
  excessHandling: z.enum(['spend', 'taxable', 'roth']),
  withholdingRate: z.number().min(0).max(1),
})

export const charitableStrategySchema = z.object({
  annualGiving: z.number().min(0),
  startAge: z.number().min(0),
  endAge: z.number().min(0),
  useQcd: z.boolean(),
  qcdAnnualAmount: z.number().min(0),
})

export const healthcareStrategySchema = z.object({
  preMedicareMonthly: z.number().min(0),
  medicarePartBMonthly: z.number().min(0),
  medicarePartDMonthly: z.number().min(0),
  medigapMonthly: z.number().min(0),
  inflationType: inflationTypeSchema,
  applyIrmaa: z.boolean(),
})

export const taxStrategySchema = z.object({
  filingStatus: filingStatusSchema,
  stateTaxRate: z.number().min(0).max(1),
  useStandardDeduction: z.boolean(),
  applyCapitalGainsRates: z.boolean(),
  policyYear: z.number().int(),
})

export const cashflowEventSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  date: isoDateStringSchema,
  amount: z.number(),
  taxTreatment: taxTreatmentSchema,
})

export const pensionIncomeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  startDate: isoDateStringSchema,
  endDate: z.union([isoDateStringSchema, z.literal('')]),
  monthlyAmount: z.number().min(0),
  inflationType: inflationTypeSchema,
  taxTreatment: taxTreatmentSchema,
})

export const scenarioStrategiesSchema = z.object({
  returnModel: returnModelStrategySchema,
  glidepath: glidepathStrategySchema,
  rebalancing: rebalancingStrategySchema,
  cashBuffer: cashBufferStrategySchema,
  withdrawal: withdrawalStrategySchema,
  taxableLot: taxableLotStrategySchema,
  earlyRetirement: earlyRetirementStrategySchema,
  rothConversion: rothConversionStrategySchema,
  rothLadder: rothLadderStrategySchema,
  rmd: rmdStrategySchema,
  charitable: charitableStrategySchema,
  healthcare: healthcareStrategySchema,
  tax: taxStrategySchema,
  events: z.array(cashflowEventSchema),
  pensions: z.array(pensionIncomeSchema),
})

export type ScenarioStrategies = z.infer<typeof scenarioStrategiesSchema>

export const createDefaultScenarioStrategies = (): ScenarioStrategies => ({
  returnModel: {
    mode: 'deterministic',
    sequenceModel: 'independent',
    volatilityScale: 1,
    correlationModel: 'none',
    cashYieldRate: 0,
  },
  glidepath: {
    mode: 'age',
    scope: 'global',
    targets: [
      { age: 40, equity: 0.8, bonds: 0.15, cash: 0.03, realEstate: 0.02, other: 0 },
      { age: 60, equity: 0.6, bonds: 0.3, cash: 0.05, realEstate: 0.05, other: 0 },
    ],
  },
  rebalancing: {
    frequency: 'annual',
    driftThreshold: 0.05,
    useContributions: true,
    taxAware: false,
    minTradeAmount: 0,
  },
  cashBuffer: {
    targetMonths: 12,
    minMonths: 6,
    maxMonths: 24,
    refillPriority: 'taxable_first',
  },
  withdrawal: {
    order: ['taxable', 'traditional', 'roth', 'hsa'],
    useCashFirst: true,
    guardrailPct: 0,
    avoidEarlyPenalty: true,
    taxableGainHarvestTarget: 0,
  },
  taxableLot: {
    costBasisMethod: 'average',
    harvestLosses: false,
    gainRealizationTarget: 0,
  },
  earlyRetirement: {
    useRothBasisFirst: true,
    allowPenalty: false,
    penaltyRate: 0.1,
    use72t: false,
    bridgeCashYears: 0,
  },
  rothConversion: {
    enabled: false,
    startAge: 0,
    endAge: 0,
    targetOrdinaryIncome: 0,
    minConversion: 0,
    maxConversion: 0,
    respectIrmaa: true,
  },
  rothLadder: {
    enabled: false,
    leadTimeYears: 5,
    startAge: 0,
    endAge: 0,
    targetAfterTaxSpending: 0,
    annualConversion: 0,
  },
  rmd: {
    enabled: true,
    startAge: 73,
    accountTypes: ['traditional'],
    excessHandling: 'taxable',
    withholdingRate: 0,
  },
  charitable: {
    annualGiving: 0,
    startAge: 0,
    endAge: 0,
    useQcd: false,
    qcdAnnualAmount: 0,
  },
  healthcare: {
    preMedicareMonthly: 0,
    medicarePartBMonthly: 0,
    medicarePartDMonthly: 0,
    medigapMonthly: 0,
    inflationType: 'medical',
    applyIrmaa: true,
  },
  tax: {
    filingStatus: 'single',
    stateTaxRate: 0,
    useStandardDeduction: true,
    applyCapitalGainsRates: true,
    policyYear: 2024,
  },
  events: [],
  pensions: [],
})

export const normalizeScenarioStrategies = (
  strategies?: Partial<ScenarioStrategies> | null,
): ScenarioStrategies => {
  const defaults = createDefaultScenarioStrategies()
  return {
    ...defaults,
    ...strategies,
    returnModel: { ...defaults.returnModel, ...strategies?.returnModel },
    glidepath: { ...defaults.glidepath, ...strategies?.glidepath },
    rebalancing: { ...defaults.rebalancing, ...strategies?.rebalancing },
    cashBuffer: { ...defaults.cashBuffer, ...strategies?.cashBuffer },
    withdrawal: { ...defaults.withdrawal, ...strategies?.withdrawal },
    taxableLot: { ...defaults.taxableLot, ...strategies?.taxableLot },
    earlyRetirement: { ...defaults.earlyRetirement, ...strategies?.earlyRetirement },
    rothConversion: { ...defaults.rothConversion, ...strategies?.rothConversion },
    rothLadder: { ...defaults.rothLadder, ...strategies?.rothLadder },
    rmd: { ...defaults.rmd, ...strategies?.rmd },
    charitable: { ...defaults.charitable, ...strategies?.charitable },
    healthcare: { ...defaults.healthcare, ...strategies?.healthcare },
    tax: { ...defaults.tax, ...strategies?.tax },
    events: strategies?.events ?? defaults.events,
    pensions: strategies?.pensions ?? defaults.pensions,
  }
}
