import { z } from 'zod'
import { baseEntitySchema } from './common'

export const personStrategySchema = baseEntitySchema.extend({
  personId: z.string().uuid(),
  futureWorkStrategyId: z.string().uuid(),
  socialSecurityStrategyId: z.string().uuid(),
})

export type PersonStrategy = z.infer<typeof personStrategySchema>
