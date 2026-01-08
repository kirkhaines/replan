import { z } from 'zod'
import { baseEntitySchema } from './common'
import { scenarioStrategiesSchema } from './scenarioStrategies'

export const scenarioSchema = baseEntitySchema.extend({
  name: z.string().min(1),
  description: z.string().optional(),
  personStrategyIds: z.array(z.string().uuid()).min(1),
  nonInvestmentAccountIds: z.array(z.string().uuid()).min(1),
  investmentAccountIds: z.array(z.string().uuid()).min(1),
  spendingStrategyId: z.string().uuid(),
  strategies: scenarioStrategiesSchema,
})

export type Scenario = z.infer<typeof scenarioSchema>
