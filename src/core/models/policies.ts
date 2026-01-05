import { z } from 'zod'
import { filingStatusSchema } from './enums'

export const taxBracketSchema = z.object({
  upTo: z.number().nullable(),
  rate: z.number().min(0).max(1),
})

export const taxPolicySchema = z.object({
  year: z.number().int(),
  filingStatus: filingStatusSchema,
  standardDeduction: z.number().min(0),
  ordinaryBrackets: z.array(taxBracketSchema),
  capitalGainsBrackets: z.array(taxBracketSchema),
})

export const irmaaTierSchema = z.object({
  maxMagi: z.number().nullable(),
  partBMonthly: z.number().min(0),
  partDMonthly: z.number().min(0),
})

export const irmaaTableSchema = z.object({
  year: z.number().int(),
  filingStatus: filingStatusSchema,
  tiers: z.array(irmaaTierSchema),
  lookbackYears: z.number().int().min(0),
})

export const rmdTableSchema = z.object({
  age: z.number().int(),
  divisor: z.number().min(0),
})

export type TaxBracket = z.infer<typeof taxBracketSchema>
export type TaxPolicy = z.infer<typeof taxPolicySchema>
export type IrmaaTier = z.infer<typeof irmaaTierSchema>
export type IrmaaTable = z.infer<typeof irmaaTableSchema>
export type RmdTableEntry = z.infer<typeof rmdTableSchema>
