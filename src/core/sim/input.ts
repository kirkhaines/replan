import { z } from 'zod'

export const simulationInputSchema = z.object({
  scenarioId: z.string().uuid(),
  currentAge: z.number().min(0),
  years: z.number().min(1),
  startingBalance: z.number(),
  annualContribution: z.number(),
  annualSpending: z.number(),
  annualReturn: z.number(),
  annualInflation: z.number(),
})

export type SimulationInput = z.infer<typeof simulationInputSchema>
