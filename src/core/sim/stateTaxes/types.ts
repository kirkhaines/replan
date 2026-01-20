export type StateTaxBracket = {
  upTo: number | null
  rate: number
}

export type StateTaxPolicy = {
  stateCode: 'ok' | 'tx'
  year: number
  filingStatus: 'single' | 'married_joint' | 'married_separate' | 'head_of_household'
  standardDeduction: number
  brackets: StateTaxBracket[]
}
