import { z } from 'zod'

export const taxTypeSchema = z.enum(['roth', 'traditional', 'hsa', 'taxable'])

export const withdrawalOrderTypeSchema = z.enum([
  'taxable',
  'traditional',
  'roth_basis',
  'roth',
  'hsa',
])

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

export const inflationTypeSchema = z.enum([
  'none',
  'cpi',
  'medical',
  'housing',
  'education',
])

export const longTermCareLevelSchema = z.enum([
  'home_aides',
  'assisted_living',
  'memory_nursing',
  'other',
])

export const filingStatusSchema = z.enum([
  'single',
  'married_joint',
  'married_separate',
  'head_of_household',
])

export const stateTaxCodeSchema = z.enum(['none', 'ok', 'tx', 'nj'])

export const beneficiaryRelationshipSchema = z.enum([
  'spouse',
  'civil_union_partner',
  'domestic_partner',
  'child',
  'stepchild',
  'grandchild',
  'parent',
  'grandparent',
  'sibling',
  'in_law',
  'niece_nephew',
  'cousin',
  'friend',
  'unrelated',
  'charity',
  'religious_institution',
  'educational_institution',
  'government_entity',
])

export const taxTreatmentSchema = z.enum([
  'ordinary',
  'capital_gains',
  'tax_exempt',
  'none',
])

export const funeralDispositionSchema = z.enum(['funeral', 'burial', 'cremation'])
