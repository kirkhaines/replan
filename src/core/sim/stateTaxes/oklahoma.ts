import type { StateTaxPolicy } from './types'

export const oklahomaTaxPolicies: StateTaxPolicy[] = [
  {
    stateCode: 'ok',
    year: 2024,
    filingStatus: 'single',
    standardDeduction: 0,
    brackets: [
      { upTo: 1000, rate: 0.0025 },
      { upTo: 2500, rate: 0.0075 },
      { upTo: 3750, rate: 0.0175 },
      { upTo: 4900, rate: 0.0275 },
      { upTo: 7200, rate: 0.0375 },
      { upTo: null, rate: 0.0475 },
    ],
  },
  {
    stateCode: 'ok',
    year: 2024,
    filingStatus: 'married_joint',
    standardDeduction: 0,
    brackets: [
      { upTo: 2000, rate: 0.0025 },
      { upTo: 5000, rate: 0.0075 },
      { upTo: 7500, rate: 0.0175 },
      { upTo: 9800, rate: 0.0275 },
      { upTo: 14400, rate: 0.0375 },
      { upTo: null, rate: 0.0475 },
    ],
  },
  {
    stateCode: 'ok',
    year: 2024,
    filingStatus: 'married_separate',
    standardDeduction: 0,
    brackets: [
      { upTo: 1000, rate: 0.0025 },
      { upTo: 2500, rate: 0.0075 },
      { upTo: 3750, rate: 0.0175 },
      { upTo: 4900, rate: 0.0275 },
      { upTo: 7200, rate: 0.0375 },
      { upTo: null, rate: 0.0475 },
    ],
  },
  {
    stateCode: 'ok',
    year: 2024,
    filingStatus: 'head_of_household',
    standardDeduction: 0,
    brackets: [
      { upTo: 1000, rate: 0.0025 },
      { upTo: 2500, rate: 0.0075 },
      { upTo: 3750, rate: 0.0175 },
      { upTo: 4900, rate: 0.0275 },
      { upTo: 7200, rate: 0.0375 },
      { upTo: null, rate: 0.0475 },
    ],
  },
]
