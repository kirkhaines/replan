import { z } from 'zod'
import { baseEntitySchema, isoDateStringSchema } from './common'
import { holdingTypeSchema, taxTypeSchema } from './enums'

export const nonInvestmentAccountSchema = baseEntitySchema.extend({
  name: z.string().min(1),
  balance: z.number().min(0),
  interestRate: z.number(),
})

const investmentAccountContributionEntrySchema = z.object({
  date: isoDateStringSchema,
  amount: z.number().min(0),
  taxType: taxTypeSchema,
})

export const investmentAccountSchema = baseEntitySchema.extend({
  name: z.string().min(1),
  contributionEntries: z.array(investmentAccountContributionEntrySchema).default([]),
})

const costBasisEntrySchema = z.object({
  date: isoDateStringSchema,
  amount: z.number().min(0),
})

const investmentAccountHoldingSchemaBase = baseEntitySchema.extend({
  name: z.string().min(1),
  taxType: taxTypeSchema,
  balance: z.number().min(0),
  costBasisEntries: z.array(costBasisEntrySchema),
  holdingType: holdingTypeSchema,
  returnRate: z.number(),
  returnStdDev: z.number(),
  investmentAccountId: z.string().uuid(),
})

export const investmentAccountHoldingSchema = z.preprocess((input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input
  }
  const record = input as Record<string, unknown>
  if (!('costBasisEntries' in record) && 'contributionBasisEntries' in record) {
    return { ...record, costBasisEntries: record.contributionBasisEntries }
  }
  return input
}, investmentAccountHoldingSchemaBase)

export type NonInvestmentAccount = z.infer<typeof nonInvestmentAccountSchema>
export type InvestmentAccount = z.infer<typeof investmentAccountSchema>
export type InvestmentAccountHolding = z.infer<typeof investmentAccountHoldingSchema>
