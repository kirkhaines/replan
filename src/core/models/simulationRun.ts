import { z } from 'zod'
import { isoDateStringSchema } from './common'
import { simulationSnapshotSchema } from './simulationSnapshot'

export const timelinePointSchema = z.object({
  yearIndex: z.number().int().min(0),
  age: z.number(),
  balance: z.number(),
  contribution: z.number(),
  spending: z.number(),
  income: z.number().optional(),
  withdrawals: z.number().optional(),
  taxes: z.number().optional(),
  cashBalance: z.number().optional(),
  investmentBalance: z.number().optional(),
  date: isoDateStringSchema.optional(),
})

export const monthlyTimelinePointSchema = z.object({
  monthIndex: z.number().int().min(0),
  date: isoDateStringSchema,
  age: z.number(),
  cashBalance: z.number(),
  investmentBalance: z.number(),
  totalBalance: z.number(),
  income: z.number(),
  spending: z.number(),
  contributions: z.number(),
  withdrawals: z.number(),
  taxes: z.number(),
  ordinaryIncome: z.number(),
  capitalGains: z.number(),
  deductions: z.number(),
})

export const simulationResultSchema = z.object({
  timeline: z.array(timelinePointSchema),
  monthlyTimeline: z.array(monthlyTimelinePointSchema).optional(),
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
