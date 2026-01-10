import { z } from 'zod'
import { baseEntitySchema, isoDateStringSchema } from './common'
import { holdingTypeSchema, taxTypeSchema } from './enums'

export const nonInvestmentAccountSchema = baseEntitySchema.extend({
  name: z.string().min(1),
  balance: z.number().min(0),
  interestRate: z.number(),
})

export const investmentAccountSchema = baseEntitySchema.extend({
  name: z.string().min(1),
})

export const investmentAccountHoldingSchema = baseEntitySchema.extend({
  name: z.string().min(1),
  taxType: taxTypeSchema,
  balance: z.number().min(0),
  contributionBasisEntries: z.array(
    z.object({
      date: isoDateStringSchema,
      amount: z.number().min(0),
    }),
  ),
  holdingType: holdingTypeSchema,
  returnRate: z.number(),
  returnStdDev: z.number(),
  investmentAccountId: z.string().uuid(),
})

export type NonInvestmentAccount = z.infer<typeof nonInvestmentAccountSchema>
export type InvestmentAccount = z.infer<typeof investmentAccountSchema>
export type InvestmentAccountHolding = z.infer<typeof investmentAccountHoldingSchema>
