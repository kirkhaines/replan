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
  startDate: z.union([isoDateStringSchema, z.null()]),
  endDate: z.union([isoDateStringSchema, z.null()]),
  '401kContributionType': z.enum(['fixed', 'percent', 'max']),
  '401kContributionAnnual': z.number().min(0),
  '401kContributionPct': z.number().min(0),
  '401kMatchPctCap': z.number(),
  '401kMatchRatio': z.number(),
  '401kInvestmentAccountHoldingId': z.string().uuid(),
  '401kEmployerMatchHoldingId': z.string().uuid(),
  'hsaContributionAnnual': z.number().min(0),
  'hsaEmployerContributionAnnual': z.number().min(0),
  'hsaUseMaxLimit': z.boolean(),
  'hsaInvestmentAccountHoldingId': z.union([z.string().uuid(), z.null()]),
  includesHealthInsurance: z.boolean(),
})

export type FutureWorkStrategy = z.infer<typeof futureWorkStrategySchema>
export type FutureWorkPeriod = z.infer<typeof futureWorkPeriodSchema>
