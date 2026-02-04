import { z } from 'zod'
import { isoDateStringSchema } from './common'

export const minimumBalanceRunPointSchema = z.object({
  yearIndex: z.number().int().min(0),
  age: z.number(),
  balance: z.number(),
  date: isoDateStringSchema.optional(),
})

export const minimumBalanceRunSchema = z.object({
  multiplier: z.number().min(0),
  endingBalance: z.number(),
  timeline: z.array(minimumBalanceRunPointSchema),
})

export type MinimumBalanceRun = z.infer<typeof minimumBalanceRunSchema>
