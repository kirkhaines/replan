import type { StateTaxPolicy } from './types'

export const texasTaxPolicies: StateTaxPolicy[] = [
  {
    stateCode: 'tx',
    year: 2024,
    filingStatus: 'single',
    standardDeduction: 0,
    brackets: [{ upTo: null, rate: 0 }],
  },
  {
    stateCode: 'tx',
    year: 2024,
    filingStatus: 'married_joint',
    standardDeduction: 0,
    brackets: [{ upTo: null, rate: 0 }],
  },
  {
    stateCode: 'tx',
    year: 2024,
    filingStatus: 'married_separate',
    standardDeduction: 0,
    brackets: [{ upTo: null, rate: 0 }],
  },
  {
    stateCode: 'tx',
    year: 2024,
    filingStatus: 'head_of_household',
    standardDeduction: 0,
    brackets: [{ upTo: null, rate: 0 }],
  },
]
