import { z } from 'zod'
import {
  filingStatusSchema,
  funeralDispositionSchema,
  inflationTypeSchema,
  longTermCareLevelSchema,
  beneficiaryRelationshipSchema,
  stateTaxCodeSchema,
  taxTreatmentSchema,
  taxTypeSchema,
  withdrawalOrderTypeSchema,
} from './enums'
import { isoDateStringSchema } from './common'
import { createUuid } from '../utils/uuid'

const inflationAssumptionsSchema = z.object(
  Object.fromEntries(
    inflationTypeSchema.options.map((key) => [key, z.number()]),
  ) as Record<(typeof inflationTypeSchema.options)[number], z.ZodNumber>,
)

export const returnModelStrategySchema = z.object({
  mode: z.enum(['deterministic', 'stochastic', 'historical']),
  sequenceModel: z.enum(['independent', 'regime']),
  volatilityScale: z.number().min(0),
  correlationModel: z.enum(['none', 'asset_class']),
  cashYieldRate: z.number().min(0),
  seed: z.number().int().optional(),
  stochasticRuns: z.number().int().min(0).default(0),
  inflationAssumptions: inflationAssumptionsSchema,
})

export const allocationTargetSchema = z.object({
  age: z.number().min(0),
  equity: z.number().min(0),
  bonds: z.number().min(0),
  realEstate: z.number().min(0),
  other: z.number().min(0),
})

export const glidepathStrategySchema = z.object({
  mode: z.enum(['age', 'year']),
  scope: z.enum(['global', 'per_account']),
  targets: z.array(allocationTargetSchema).min(0),
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
})

export const withdrawalStrategySchema = z.object({
  order: z.array(withdrawalOrderTypeSchema).min(1),
  useCashFirst: z.boolean(),
  guardrailStrategy: z.enum(['none', 'legacy', 'cap_wants', 'portfolio_health', 'guyton']),
  guardrailPct: z.number().min(0).max(1),
  guardrailWithdrawalRateLimit: z.number().min(0),
  guardrailHealthPoints: z.array(
    z.object({
      health: z.number().min(0),
      factor: z.number().min(0).max(1),
    }),
  ),
  guardrailGuytonTriggerRateIncrease: z.number().min(0),
  guardrailGuytonAppliedPct: z.number().min(0).max(1),
  guardrailGuytonDurationMonths: z.number().int().min(0),
  avoidEarlyPenalty: z.boolean(),
  taxableGainHarvestTarget: z.number().min(0),
})

export const taxableLotStrategySchema = z.object({
  costBasisMethod: z.enum(['average', 'fifo', 'lifo']),
  harvestLosses: z.boolean(),
  gainRealizationTarget: z.number().min(0),
})

export const earlyRetirementStrategySchema = z.object({
  allowPenalty: z.boolean(),
  penaltyRate: z.number().min(0).max(1),
  use72t: z.boolean(),
  bridgeCashYears: z.number().min(0),
})

export const rothConversionStrategySchema = z.object({
  enabled: z.boolean(),
  startAge: z.number().min(0),
  endAge: z.number().min(0),
  targetOrdinaryBracketRate: z.coerce.number().min(0).max(1),
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
  longTermCareDurationYears: z.number().min(0),
  longTermCareLevel: longTermCareLevelSchema,
  longTermCareAnnualExpense: z.number().min(0),
  decliningHealthStartAge: z.number().min(0),
  decliningHealthTreatmentDurationYears: z.number().min(0),
  decliningHealthAnnualExpense: z.number().min(0),
  decliningHealthPostTreatmentAnnualExpense: z.number().min(0),
})

export const taxStrategySchema = z.object({
  filingStatus: filingStatusSchema,
  stateCode: stateTaxCodeSchema.default('none'),
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

export const beneficiarySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  sharePct: z.number().min(0).max(1),
  stateOfResidence: stateTaxCodeSchema,
  relationship: beneficiaryRelationshipSchema,
  assumedOrdinaryRate: z.number().min(0).max(1),
  assumedCapitalGainsRate: z.number().min(0).max(1),
})

export const deathStrategySchema = z.object({
  enabled: z.boolean(),
  funeralDisposition: funeralDispositionSchema,
  funeralCostOverride: z.number().min(0),
  estateTaxExemption: z.number().min(0),
  estateTaxRate: z.number().min(0).max(1),
  taxableStepUp: z.boolean(),
  beneficiaries: z.array(beneficiarySchema).min(1),
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
  death: deathStrategySchema,
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
    stochasticRuns: 0,
    inflationAssumptions: inflationTypeSchema.options.reduce(
      (acc, type) => ({ ...acc, [type]: 0 }),
      {} as Record<(typeof inflationTypeSchema.options)[number], number>,
    ),
  },
  glidepath: {
    mode: 'age',
    scope: 'global',
    targets: [
      { age: 40, equity: 0.8, bonds: 0.18, realEstate: 0.02, other: 0 },
      { age: 60, equity: 0.6, bonds: 0.35, realEstate: 0.05, other: 0 },
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
  },
  withdrawal: {
    order: ['taxable', 'traditional', 'roth_basis', 'roth', 'hsa'],
    useCashFirst: true,
    guardrailStrategy: 'none',
    guardrailPct: 0,
    guardrailWithdrawalRateLimit: 0.04,
    guardrailHealthPoints: [
      { health: 1.05, factor: 1 },
      { health: 0.95, factor: 0.75 },
      { health: 0.85, factor: 0.5 },
      { health: 0.8, factor: 0 },
    ],
    guardrailGuytonTriggerRateIncrease: 0.2,
    guardrailGuytonAppliedPct: 0.1,
    guardrailGuytonDurationMonths: 12,
    avoidEarlyPenalty: true,
    taxableGainHarvestTarget: 0,
  },
  taxableLot: {
    costBasisMethod: 'average',
    harvestLosses: false,
    gainRealizationTarget: 0,
  },
  earlyRetirement: {
    allowPenalty: false,
    penaltyRate: 0.1,
    use72t: false,
    bridgeCashYears: 0,
  },
  rothConversion: {
    enabled: false,
    startAge: 0,
    endAge: 0,
    targetOrdinaryBracketRate: 0,
    minConversion: 0,
    maxConversion: 0,
    respectIrmaa: true,
  },
  rothLadder: {
    enabled: false,
    leadTimeYears: 5,
    startAge: 0,
    endAge: 59.5,
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
    longTermCareDurationYears: 0,
    longTermCareLevel: 'home_aides',
    longTermCareAnnualExpense: 0,
    decliningHealthStartAge: 0,
    decliningHealthTreatmentDurationYears: 0,
    decliningHealthAnnualExpense: 0,
    decliningHealthPostTreatmentAnnualExpense: 0,
  },
  tax: {
    filingStatus: 'single',
    stateCode: 'none',
    stateTaxRate: 0,
    useStandardDeduction: true,
    applyCapitalGainsRates: true,
    policyYear: 2024,
  },
  death: {
    enabled: false,
    funeralDisposition: 'funeral',
    funeralCostOverride: 0,
    estateTaxExemption: 12920000,
    estateTaxRate: 0.4,
    taxableStepUp: true,
    beneficiaries: [
      {
        id: createUuid(),
        name: 'Heir',
        sharePct: 1,
        stateOfResidence: 'none',
        relationship: 'child',
        assumedOrdinaryRate: 0.22,
        assumedCapitalGainsRate: 0.15,
      },
    ],
  },
  events: [],
  pensions: [],
})

export const normalizeScenarioStrategies = (
  strategies?: Partial<ScenarioStrategies> | null,
): ScenarioStrategies => {
  const defaults = createDefaultScenarioStrategies()
  const providedGuardrailPct =
    strategies?.withdrawal?.guardrailPct ?? defaults.withdrawal.guardrailPct
  const guardrailStrategy =
    strategies?.withdrawal?.guardrailStrategy ??
    (providedGuardrailPct > 0 ? 'legacy' : defaults.withdrawal.guardrailStrategy)
  const withdrawalOrder = (() => {
    const provided = strategies?.withdrawal?.order ?? defaults.withdrawal.order
    const remaining = defaults.withdrawal.order.filter((type) => !provided.includes(type))
    return provided.length < defaults.withdrawal.order.length
      ? [...provided, ...remaining]
      : provided
  })()
  const beneficiaries =
    strategies?.death?.beneficiaries && strategies.death.beneficiaries.length > 0
      ? strategies.death.beneficiaries.map((entry) => ({
          ...entry,
          stateOfResidence:
            entry.stateOfResidence ?? defaults.death.beneficiaries[0].stateOfResidence,
          relationship: entry.relationship ?? defaults.death.beneficiaries[0].relationship,
        }))
      : defaults.death.beneficiaries
  return {
    ...defaults,
    ...strategies,
    returnModel: { ...defaults.returnModel, ...strategies?.returnModel },
    glidepath: { ...defaults.glidepath, ...strategies?.glidepath, scope: 'global' },
    rebalancing: { ...defaults.rebalancing, ...strategies?.rebalancing },
    cashBuffer: { ...defaults.cashBuffer, ...strategies?.cashBuffer },
    withdrawal: {
      ...defaults.withdrawal,
      ...strategies?.withdrawal,
      order: withdrawalOrder,
      guardrailStrategy,
    },
    taxableLot: { ...defaults.taxableLot, ...strategies?.taxableLot },
    earlyRetirement: { ...defaults.earlyRetirement, ...strategies?.earlyRetirement },
    rothConversion: { ...defaults.rothConversion, ...strategies?.rothConversion },
    rothLadder: { ...defaults.rothLadder, ...strategies?.rothLadder },
    rmd: { ...defaults.rmd, ...strategies?.rmd },
    charitable: { ...defaults.charitable, ...strategies?.charitable },
    healthcare: { ...defaults.healthcare, ...strategies?.healthcare },
    tax: { ...defaults.tax, ...strategies?.tax },
    death: { ...defaults.death, ...strategies?.death, beneficiaries },
    events: strategies?.events ?? defaults.events,
    pensions: strategies?.pensions ?? defaults.pensions,
  }
}
