import { z } from 'zod'
import { baseEntitySchema, isoDateStringSchema } from './common'

export const futureWorkStrategySchema = baseEntitySchema.extend({
  name: z.string().min(1),
  personId: z.string().uuid(),
})

export const futureWorkPeriodSchema = baseEntitySchema.extend({
  name: z.string().min(1),
  futureWorkStrategyId: z.string().uuid(),
  salary: z.number().min(0),
  bonus: z.number().min(0),
  startDate: isoDateStringSchema,
  endDate: isoDateStringSchema,
  '401kMatchPctCap': z.number(),
  '401kMatchRatio': z.number(),
  '401kInvestmentAccountHoldingId': z.string().uuid(),
  includesHealthInsurance: z.boolean(),
})

export type FutureWorkStrategy = z.infer<typeof futureWorkStrategySchema>
export type FutureWorkPeriod = z.infer<typeof futureWorkPeriodSchema>
