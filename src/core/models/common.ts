import { z } from 'zod'

export const baseEntitySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const isoDateStringSchema = z.string().refine(
  (value) => !Number.isNaN(Date.parse(value)),
  { message: 'Invalid date string' },
)
