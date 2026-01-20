import type { StateTaxPolicy } from './types'
import { oklahomaTaxPolicies } from './oklahoma'
import { texasTaxPolicies } from './texas'

const policiesByState: Record<StateTaxPolicy['stateCode'], StateTaxPolicy[]> = {
  ok: oklahomaTaxPolicies,
  tx: texasTaxPolicies,
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
