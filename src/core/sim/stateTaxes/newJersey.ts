import type { InheritanceTaxPolicy, StateTaxPolicy } from './types'

// TODO: Verify NJ brackets; using 2024 single-rate thresholds as a placeholder across filings.
const brackets = [
  { upTo: 20000, rate: 0.014 },
  { upTo: 35000, rate: 0.0175 },
  { upTo: 40000, rate: 0.035 },
  { upTo: 75000, rate: 0.05525 },
  { upTo: 500000, rate: 0.0637 },
  { upTo: 1000000, rate: 0.0897 },
  { upTo: null, rate: 0.1075 },
]

export const newJerseyTaxPolicies: StateTaxPolicy[] = [
  {
    stateCode: 'nj',
    year: 2024,
    filingStatus: 'single',
    standardDeduction: 0,
    brackets,
  },
  {
    stateCode: 'nj',
    year: 2024,
    filingStatus: 'married_joint',
    standardDeduction: 0,
    brackets,
  },
  {
    stateCode: 'nj',
    year: 2024,
    filingStatus: 'married_separate',
    standardDeduction: 0,
    brackets,
  },
  {
    stateCode: 'nj',
    year: 2024,
    filingStatus: 'head_of_household',
    standardDeduction: 0,
    brackets,
  },
]

const classARelationships: InheritanceTaxPolicy['classes'][number]['relationships'] = [
  'spouse',
  'civil_union_partner',
  'domestic_partner',
  'child',
  'stepchild',
  'grandchild',
  'parent',
  'grandparent',
]

const classCRelationships: InheritanceTaxPolicy['classes'][number]['relationships'] = [
  'sibling',
  'in_law',
]

const classDRelationships: InheritanceTaxPolicy['classes'][number]['relationships'] = [
  'niece_nephew',
  'cousin',
  'friend',
  'unrelated',
]

const classERelationships: InheritanceTaxPolicy['classes'][number]['relationships'] = [
  'charity',
  'religious_institution',
  'educational_institution',
  'government_entity',
]

export const newJerseyInheritancePolicies: InheritanceTaxPolicy[] = [
  {
    stateCode: 'nj',
    year: 2024,
    assetFilters: {
      includeTags: ['cash', 'taxable', 'real_estate'],
      excludeTags: ['traditional', 'roth', 'hsa'],
    },
    classes: [
      {
        classId: 'A',
        relationships: classARelationships,
        exemption: 0,
        brackets: [{ upTo: null, rate: 0 }],
      },
      {
        classId: 'C',
        relationships: classCRelationships,
        exemption: 25000,
        // NOTE: NJ Class C uses graduated brackets; this keeps the summary thresholds.
        brackets: [
          { upTo: 1_075_000, rate: 0.11 },
          { upTo: null, rate: 0.16 },
        ],
      },
      {
        classId: 'D',
        relationships: classDRelationships,
        exemption: 0,
        // NOTE: NJ Class D is summarized as 15%–16%; apply a two-tier approximation.
        brackets: [
          { upTo: 1_075_000, rate: 0.15 },
          { upTo: null, rate: 0.16 },
        ],
      },
      {
        classId: 'E',
        relationships: classERelationships,
        exemption: 0,
        brackets: [{ upTo: null, rate: 0 }],
      },
    ],
  },
]
