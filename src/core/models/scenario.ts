import { z } from 'zod'

export const personSchema = z
  .object({
    currentAge: z.number().min(20).max(80),
    retirementAge: z.number().min(35).max(90),
  })
  .refine((value) => value.retirementAge > value.currentAge, {
    message: 'Retirement age must be greater than current age.',
    path: ['retirementAge'],
  })

export const financesSchema = z.object({
  startingBalance: z.number().min(0),
  annualContribution: z.number().min(0),
  annualSpending: z.number().min(0),
})

export const assumptionsSchema = z.object({
  annualReturn: z.number().min(-0.5).max(0.5),
  annualInflation: z.number().min(-0.1).max(0.2),
  years: z.number().min(5).max(80),
})

export const scenarioSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  person: personSchema,
  finances: financesSchema,
  assumptions: assumptionsSchema,
})

export type Scenario = z.infer<typeof scenarioSchema>
