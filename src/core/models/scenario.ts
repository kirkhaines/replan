import { z } from 'zod'
import { baseEntitySchema } from './common'
import { fundingStrategyTypeSchema } from './enums'

export const scenarioSchema = baseEntitySchema.extend({
  name: z.string().min(1),
  personStrategyIds: z.array(z.string().uuid()).min(1),
  nonInvestmentAccountIds: z.array(z.string().uuid()).min(1),
  investmentAccountIds: z.array(z.string().uuid()).min(1),
  spendingStrategyId: z.string().uuid(),
  fundingStrategyType: fundingStrategyTypeSchema,
})

export type Scenario = z.infer<typeof scenarioSchema>
