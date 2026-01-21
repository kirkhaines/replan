import { z } from 'zod'
import { baseEntitySchema } from './common'
import { holdingTypeSchema, inflationTypeSchema } from './enums'

export const inflationDefaultSchema = baseEntitySchema.extend({
  type: inflationTypeSchema,
  rate: z.number(),
})

export const ssaWageIndexSchema = baseEntitySchema.extend({
  year: z.number().int(),
  index: z.number().min(0),
})

export const ssaBendPointSchema = baseEntitySchema.extend({
  year: z.number().int(),
  first: z.number().min(0),
  second: z.number().min(0),
})

export const ssaRetirementAdjustmentSchema = baseEntitySchema.extend({
  birthYearStart: z.number().int(),
  birthYearEnd: z.number().int(),
  normalRetirementAgeMonths: z.number().int().min(0),
  delayedRetirementCreditPerYear: z.number().min(0),
})

export const holdingTypeDefaultSchema = baseEntitySchema.extend({
  type: holdingTypeSchema,
  returnRate: z.number(),
  returnStdDev: z.number(),
})

export const contributionLimitTypeSchema = z.enum(['401k', 'hsa', 'ira'])

export const contributionLimitDefaultSchema = baseEntitySchema.extend({
  type: contributionLimitTypeSchema,
  year: z.number().int(),
  amount: z.number().min(0),
})

export type InflationDefault = z.infer<typeof inflationDefaultSchema>
export type SsaWageIndex = z.infer<typeof ssaWageIndexSchema>
export type SsaBendPoint = z.infer<typeof ssaBendPointSchema>
export type SsaRetirementAdjustment = z.infer<typeof ssaRetirementAdjustmentSchema>
export type HoldingTypeDefault = z.infer<typeof holdingTypeDefaultSchema>
export type ContributionLimitDefault = z.infer<typeof contributionLimitDefaultSchema>
