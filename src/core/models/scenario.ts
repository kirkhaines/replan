import { z } from 'zod'
import { baseEntitySchema } from './common'
import { fundingStrategyTypeSchema, inflationTypeSchema } from './enums'

const inflationAssumptionsSchema = z.object(
  Object.fromEntries(
    inflationTypeSchema.options.map((key) => [key, z.number()]),
  ) as Record<(typeof inflationTypeSchema.options)[number], z.ZodNumber>,
)

export const scenarioSchema = baseEntitySchema.extend({
  name: z.string().min(1),
  personStrategyIds: z.array(z.string().uuid()).min(1),
  nonInvestmentAccountIds: z.array(z.string().uuid()).min(1),
  investmentAccountIds: z.array(z.string().uuid()).min(1),
  spendingStrategyId: z.string().uuid(),
  fundingStrategyType: fundingStrategyTypeSchema,
  inflationAssumptions: inflationAssumptionsSchema,
})

export type Scenario = z.infer<typeof scenarioSchema>
