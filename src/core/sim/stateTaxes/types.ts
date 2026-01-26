import type { BeneficiaryRelationship } from '../../models'

export type StateTaxBracket = {
  upTo: number | null
  rate: number
}

export type StateTaxPolicy = {
  stateCode: 'ok' | 'tx' | 'nj'
  year: number
  filingStatus: 'single' | 'married_joint' | 'married_separate' | 'head_of_household'
  standardDeduction: number
  brackets: StateTaxBracket[]
}

export type InheritanceTaxAssetTag =
  | 'cash'
  | 'taxable'
  | 'traditional'
  | 'roth'
  | 'hsa'
  | 'real_estate'

export type InheritanceTaxAssetFilter = {
  includeTags?: InheritanceTaxAssetTag[]
  excludeTags?: InheritanceTaxAssetTag[]
}

export type InheritanceTaxBracket = {
  upTo: number | null
  rate: number
}

export type InheritanceTaxClass = {
  classId: string
  relationships: BeneficiaryRelationship[]
  exemption: number
  brackets: InheritanceTaxBracket[]
}

export type InheritanceTaxPolicy = {
  stateCode: StateTaxPolicy['stateCode']
  year: number
  assetFilters: InheritanceTaxAssetFilter
  classes: InheritanceTaxClass[]
}
