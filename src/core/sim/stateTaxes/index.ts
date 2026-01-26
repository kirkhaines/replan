import type {
  InheritanceTaxPolicy,
  InheritanceTaxBracket,
  StateTaxPolicy,
} from './types'
import { newJerseyInheritancePolicies, newJerseyTaxPolicies } from './newJersey'
import { oklahomaTaxPolicies } from './oklahoma'
import { texasTaxPolicies } from './texas'

const policiesByState: Record<StateTaxPolicy['stateCode'], StateTaxPolicy[]> = {
  nj: newJerseyTaxPolicies,
  ok: oklahomaTaxPolicies,
  tx: texasTaxPolicies,
}

const inheritancePoliciesByState: Record<
  StateTaxPolicy['stateCode'],
  InheritanceTaxPolicy[]
> = {
  nj: newJerseyInheritancePolicies,
  ok: [],
  tx: [],
}

const selectByYear = <T extends { year: number }>(records: T[], year: number) => {
  if (records.length === 0) {
    return null
  }
  const sorted = [...records].sort((a, b) => a.year - b.year)
  const exact = sorted.find((record) => record.year === year)
  if (exact) {
    return exact
  }
  const prior = [...sorted].reverse().find((record) => record.year < year)
  return prior ?? sorted[0]
}

export const selectStateTaxPolicy = (
  stateCode: StateTaxPolicy['stateCode'],
  year: number,
  filingStatus: StateTaxPolicy['filingStatus'],
) => {
  const policies = policiesByState[stateCode] ?? []
  const matching = policies.filter((policy) => policy.filingStatus === filingStatus)
  return selectByYear(matching, year)
}

export const selectInheritanceTaxPolicy = (
  stateCode: StateTaxPolicy['stateCode'],
  year: number,
) => {
  const policies = inheritancePoliciesByState[stateCode] ?? []
  return selectByYear(policies, year)
}

const computeBracketTax = (taxableAmount: number, brackets: InheritanceTaxBracket[]) => {
  let remaining = Math.max(0, taxableAmount)
  let lastLimit = 0
  let tax = 0
  for (const bracket of brackets) {
    const limit = bracket.upTo ?? Infinity
    const taxable = Math.max(0, Math.min(remaining, limit - lastLimit))
    if (taxable <= 0) {
      break
    }
    tax += taxable * bracket.rate
    remaining -= taxable
    lastLimit = limit
  }
  return tax
}

export const computeInheritanceTax = ({
  taxableAmount,
  relationship,
  policy,
}: {
  taxableAmount: number
  relationship: InheritanceTaxPolicy['classes'][number]['relationships'][number]
  policy: InheritanceTaxPolicy
}) => {
  const classPolicy = policy.classes.find((entry) =>
    entry.relationships.includes(relationship),
  )
  if (!classPolicy) {
    return 0
  }
  const taxableAfterExemption = Math.max(0, taxableAmount - classPolicy.exemption)
  return computeBracketTax(taxableAfterExemption, classPolicy.brackets)
}

export const computeStateTax = ({
  taxableIncome,
  policy,
  useStandardDeduction,
}: {
  taxableIncome: number
  policy: StateTaxPolicy
  useStandardDeduction: boolean
}) => {
  const standardDeductionApplied = useStandardDeduction ? policy.standardDeduction : 0
  let remaining = Math.max(0, taxableIncome - standardDeductionApplied)
  let lastLimit = 0
  let tax = 0
  for (const bracket of policy.brackets) {
    const limit = bracket.upTo ?? Infinity
    const taxable = Math.max(0, Math.min(remaining, limit - lastLimit))
    if (taxable <= 0) {
      break
    }
    tax += taxable * bracket.rate
    remaining -= taxable
    lastLimit = limit
  }
  return tax
}
