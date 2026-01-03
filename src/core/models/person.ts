import { z } from 'zod'
import { baseEntitySchema, isoDateStringSchema } from './common'

export const personSchema = baseEntitySchema.extend({
  name: z.string().min(1),
  dateOfBirth: isoDateStringSchema,
  lifeExpectancy: z.number().min(0),
})

export type Person = z.infer<typeof personSchema>
