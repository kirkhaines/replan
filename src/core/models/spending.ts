import { z } from 'zod'
import { baseEntitySchema, isoDateStringSchema } from './common'
import { inflationTypeSchema } from './enums'

export const spendingStrategySchema = baseEntitySchema.extend({
  name: z.string().min(1),
})

export const spendingLineItemSchema = baseEntitySchema.extend({
  name: z.string().min(1),
  spendingStrategyId: z.string().uuid(),
  category: z.string().min(1),
  needAmount: z.number().min(0),
  wantAmount: z.number().min(0),
  startDate: z.union([isoDateStringSchema, z.literal('')]),
  endDate: z.union([isoDateStringSchema, z.literal('')]),
  futureWorkPeriodId: z.string().uuid().optional(),
  isPreTax: z.boolean(),
  isCharitable: z.boolean(),
  isWork: z.boolean(),
  targetInvestmentAccountHoldingId: z.union([z.string().uuid(), z.null()]).optional(),
  inflationType: inflationTypeSchema,
})

export type SpendingStrategy = z.infer<typeof spendingStrategySchema>
export type SpendingLineItem = z.infer<typeof spendingLineItemSchema>
