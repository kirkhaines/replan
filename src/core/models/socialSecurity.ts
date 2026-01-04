import { z } from 'zod'
import { baseEntitySchema, isoDateStringSchema } from './common'

export const socialSecurityEarningsSchema = baseEntitySchema.extend({
  personId: z.string().uuid(),
  year: z.number().int(),
  amount: z.number().min(0),
  months: z.number().int().min(1).max(12),
})

export const socialSecurityStrategySchema = baseEntitySchema.extend({
  personId: z.string().uuid(),
  startDate: isoDateStringSchema,
})

export type SocialSecurityEarnings = z.infer<typeof socialSecurityEarningsSchema>
export type SocialSecurityStrategy = z.infer<typeof socialSecurityStrategySchema>
