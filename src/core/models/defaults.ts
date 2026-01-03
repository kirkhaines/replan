import { z } from 'zod'
import { baseEntitySchema } from './common'
import { inflationTypeSchema } from './enums'

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

export type InflationDefault = z.infer<typeof inflationDefaultSchema>
export type SsaWageIndex = z.infer<typeof ssaWageIndexSchema>
export type SsaBendPoint = z.infer<typeof ssaBendPointSchema>
