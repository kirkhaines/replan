import { z } from 'zod'

export const taxTypeSchema = z.enum(['roth', 'traditional', 'hsa', 'taxable'])

export const holdingTypeSchema = z.enum([
  'bonds',
  'sp500',
  'nasdaq',
  'dow',
  'non_us_developed',
  'emerging_markets',
  'real_estate',
  'cash',
  'other',
])

export const fundingStrategyTypeSchema = z.enum([
  'pro_rata',
  'roth_ladder_then_taxable',
  'tax_deferred_then_tax_free',
])

export const inflationTypeSchema = z.enum([
  'none',
  'cpi',
  'medical',
  'housing',
  'education',
])
