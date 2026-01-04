import { z } from 'zod'
import { simulationSnapshotSchema } from './simulationSnapshot'

export const timelinePointSchema = z.object({
  yearIndex: z.number().int().min(0),
  age: z.number(),
  balance: z.number(),
  contribution: z.number(),
  spending: z.number(),
})

export const simulationResultSchema = z.object({
  timeline: z.array(timelinePointSchema),
  summary: z.object({
    endingBalance: z.number(),
    minBalance: z.number(),
    maxBalance: z.number(),
  }),
})

export const simulationRunSchema = z.object({
  id: z.string().uuid(),
  scenarioId: z.string().uuid(),
  startedAt: z.number(),
  finishedAt: z.number(),
  status: z.enum(['success', 'error']),
  errorMessage: z.string().optional(),
  result: simulationResultSchema,
  snapshot: simulationSnapshotSchema.optional(),
})

export type SimulationResult = z.infer<typeof simulationResultSchema>
export type SimulationRun = z.infer<typeof simulationRunSchema>
