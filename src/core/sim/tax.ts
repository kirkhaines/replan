import type {
  IrmaaTable,
  SocialSecurityProvisionalIncomeBracket,
  TaxPolicy,
} from '../models'

export type TaxComputation = {
  taxOwed: number
  magi: number
  taxableOrdinaryIncome: number
  taxableCapitalGains: number
  taxableSocialSecurity: number
  standardDeductionApplied: number
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

export const selectTaxPolicy = (
  policies: TaxPolicy[],
  year: number,
  filingStatus: TaxPolicy['filingStatus'],
) => {
  const matching = policies.filter((policy) => policy.filingStatus === filingStatus)
  return selectByYear(matching, year)
}

export const selectSocialSecurityProvisionalIncomeBracket = (
  brackets: SocialSecurityProvisionalIncomeBracket[],
  year: number,
  filingStatus: SocialSecurityProvisionalIncomeBracket['filingStatus'],
) => {
  const matching = brackets.filter((bracket) => bracket.filingStatus === filingStatus)
  return selectByYear(matching, year)
}

export const computeTaxableSocialSecurity = ({
  benefits,
  ordinaryIncome,
  capitalGains,
  taxExemptIncome,
  bracket,
}: {
  benefits: number
  ordinaryIncome: number
  capitalGains: number
  taxExemptIncome: number
  bracket: SocialSecurityProvisionalIncomeBracket | null
}) => {
  if (benefits <= 0) {
    return { taxableBenefits: 0, provisionalIncome: 0 }
  }
  if (!bracket) {
    return { taxableBenefits: benefits, provisionalIncome: 0 }
  }
  const provisionalIncome =
    Math.max(0, ordinaryIncome) +
    Math.max(0, capitalGains) +
    Math.max(0, taxExemptIncome) +
    Math.max(0, benefits) * 0.5

  if (bracket.baseAmount === 0 && bracket.adjustedBaseAmount === 0) {
    // Approximate the MFS-with-spouse rule where 85% of benefits are taxable.
    return { taxableBenefits: benefits * 0.85, provisionalIncome }
  }

  if (provisionalIncome <= bracket.baseAmount) {
    return { taxableBenefits: 0, provisionalIncome }
  }
  if (provisionalIncome <= bracket.adjustedBaseAmount) {
    const taxable = 0.5 * (provisionalIncome - bracket.baseAmount)
    return { taxableBenefits: Math.min(benefits * 0.5, taxable), provisionalIncome }
  }
  const baseTaxable = 0.5 * Math.min(benefits, bracket.adjustedBaseAmount - bracket.baseAmount)
  const additionalTaxable = 0.85 * (provisionalIncome - bracket.adjustedBaseAmount)
  const taxableBenefits = Math.min(benefits * 0.85, baseTaxable + additionalTaxable)
  return { taxableBenefits, provisionalIncome }
}

const computeBracketTax = (income: number, brackets: TaxPolicy['ordinaryBrackets']) => {
  let remaining = income
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

const computeCapitalGainsTax = (
  capitalGains: number,
  ordinaryIncome: number,
  brackets: TaxPolicy['capitalGainsBrackets'],
) => {
  let remaining = ordinaryIncome + capitalGains
  let remainingOrdinaryIncome = ordinaryIncome
  let lastLimit = 0
  let tax = 0
  for (const bracket of brackets) {
    const limit = bracket.upTo ?? Infinity
    const taxable = Math.max(0, Math.min(remaining, limit - lastLimit))
    const taxableOrdinaryIncome = Math.max(0, Math.min(remainingOrdinaryIncome, limit - lastLimit))
    if (taxable <= 0) {
      break
    }
    tax += (taxable - taxableOrdinaryIncome) * bracket.rate
    remaining -= taxable
    remainingOrdinaryIncome -= taxableOrdinaryIncome
    lastLimit = limit
  }
  return tax
}

export const computeTax = ({
  ordinaryIncome,
  capitalGains,
  deductions,
  taxExemptIncome,
  stateTaxRate,
  policy,
  useStandardDeduction,
  applyCapitalGainsRates,
  socialSecurityBenefits = 0,
  socialSecurityProvisionalBracket = null,
}: {
  ordinaryIncome: number
  capitalGains: number
  deductions: number
  taxExemptIncome: number
  stateTaxRate: number
  policy: TaxPolicy
  useStandardDeduction: boolean
  applyCapitalGainsRates: boolean
  socialSecurityBenefits?: number
  socialSecurityProvisionalBracket?: SocialSecurityProvisionalIncomeBracket | null
}): TaxComputation => {
  const standardDeductionApplied = useStandardDeduction ? policy.standardDeduction : 0
  const { taxableBenefits } = computeTaxableSocialSecurity({
    benefits: socialSecurityBenefits,
    ordinaryIncome,
    capitalGains,
    taxExemptIncome,
    bracket: socialSecurityProvisionalBracket,
  })
  const taxableOrdinaryIncome = Math.max(
    0,
    ordinaryIncome + taxableBenefits - deductions - standardDeductionApplied,
  )
  const taxableCapitalGains = Math.max(0, capitalGains)
  const ordinaryTax = computeBracketTax(taxableOrdinaryIncome, policy.ordinaryBrackets)
  const capitalGainsTax = applyCapitalGainsRates
    ? computeCapitalGainsTax(taxableCapitalGains, taxableOrdinaryIncome, policy.capitalGainsBrackets)
    : computeBracketTax(taxableCapitalGains, policy.ordinaryBrackets)
  const stateTax = stateTaxRate * (taxableOrdinaryIncome + taxableCapitalGains)
  const taxOwed = ordinaryTax + capitalGainsTax + stateTax
  const magi = ordinaryIncome + taxableBenefits + capitalGains + taxExemptIncome

  return {
    taxOwed,
    magi,
    taxableOrdinaryIncome,
    taxableCapitalGains,
    taxableSocialSecurity: taxableBenefits,
    standardDeductionApplied,
  }
}

export const selectIrmaaTable = (
  tables: IrmaaTable[],
  year: number,
  filingStatus: IrmaaTable['filingStatus'],
) => {
  const matching = tables.filter((table) => table.filingStatus === filingStatus)
  return selectByYear(matching, year)
}

export const computeIrmaaSurcharge = (
  table: IrmaaTable | null,
  magi: number,
) => {
  if (!table) {
    return { partBMonthly: 0, partDMonthly: 0 }
  }
  const tier = table.tiers.find((entry) => entry.maxMagi === null || magi <= entry.maxMagi)
  if (!tier) {
    return { partBMonthly: 0, partDMonthly: 0 }
  }
  return { partBMonthly: tier.partBMonthly, partDMonthly: tier.partDMonthly }
}
