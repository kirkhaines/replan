import type { TaxPolicy } from '../models'

export type PayrollTaxPolicy = {
  year: number
  socialSecurityWageBase: number
  medicareAdditionalThreshold: Record<TaxPolicy['filingStatus'], number>
}

export const payrollTaxPolicies: PayrollTaxPolicy[] = [
  {
    year: 2024,
    socialSecurityWageBase: 168600,
    medicareAdditionalThreshold: {
      single: 200000,
      married_joint: 250000,
      married_separate: 125000,
      head_of_household: 200000,
    },
  },
]

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

export const selectPayrollTaxPolicy = (year: number) =>
  selectByYear(payrollTaxPolicies, year)

export const computePayrollTaxes = ({
  earnedIncome,
  filingStatus,
  policy,
}: {
  earnedIncome: number
  filingStatus: TaxPolicy['filingStatus']
  policy: PayrollTaxPolicy
}) => {
  const socialSecurityTaxable = Math.max(0, Math.min(earnedIncome, policy.socialSecurityWageBase))
  const socialSecurityTax = socialSecurityTaxable * 0.062
  const medicareBaseTax = earnedIncome * 0.0145
  const threshold = policy.medicareAdditionalThreshold[filingStatus]
  const additionalMedicare =
    earnedIncome > threshold ? (earnedIncome - threshold) * 0.009 : 0
  const medicareTax = medicareBaseTax + additionalMedicare
  return {
    socialSecurityTax,
    medicareTax,
    totalPayrollTax: socialSecurityTax + medicareTax,
  }
}
