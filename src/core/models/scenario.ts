import { z } from 'zod'
import { baseEntitySchema } from './common'
import { fundingStrategyTypeSchema } from './enums'

export const legacyPersonSchema = z
  .object({
    currentAge: z.number().min(20).max(80),
    retirementAge: z.number().min(35).max(90),
  })
  .refine((value) => value.retirementAge > value.currentAge, {
    message: 'Retirement age must be greater than current age.',
    path: ['retirementAge'],
  })

export const legacyFinancesSchema = z.object({
  startingBalance: z.number().min(0),
  annualContribution: z.number().min(0),
  annualSpending: z.number().min(0),
})

export const legacyAssumptionsSchema = z.object({
  annualReturn: z.number().min(-0.5).max(0.5),
  annualInflation: z.number().min(-0.1).max(0.2),
  years: z.number().min(5).max(80),
})

export const scenarioSchema = baseEntitySchema.extend({
  name: z.string().min(1),
  personStrategyIds: z.array(z.string().uuid()).optional(),
  nonInvestmentAccountIds: z.array(z.string().uuid()).optional(),
  investmentAccountIds: z.array(z.string().uuid()).optional(),
  spendingStrategyId: z.string().uuid().optional(),
  fundingStrategyType: fundingStrategyTypeSchema.optional(),
  person: legacyPersonSchema,
  finances: legacyFinancesSchema,
  assumptions: legacyAssumptionsSchema,
})

export type Scenario = z.infer<typeof scenarioSchema>
