import type { IrmaaTable, TaxPolicy } from '../models'

export type TaxComputation = {
  taxOwed: number
  magi: number
  taxableOrdinaryIncome: number
  taxableCapitalGains: number
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
  let remaining = capitalGains
  let tax = 0
  let offset = ordinaryIncome
  for (const bracket of brackets) {
    const limit = bracket.upTo ?? Infinity
    const available = Math.max(0, limit - offset)
    const taxable = Math.max(0, Math.min(remaining, available))
    if (taxable <= 0) {
      offset = Math.min(limit, offset)
      continue
    }
    tax += taxable * bracket.rate
    remaining -= taxable
    offset += taxable
  }
  if (remaining > 0) {
    const topRate = brackets.length > 0 ? brackets[brackets.length - 1].rate : 0
    tax += remaining * topRate
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
}: {
  ordinaryIncome: number
  capitalGains: number
  deductions: number
  taxExemptIncome: number
  stateTaxRate: number
  policy: TaxPolicy
  useStandardDeduction: boolean
  applyCapitalGainsRates: boolean
}): TaxComputation => {
  const standardDeductionApplied = useStandardDeduction ? policy.standardDeduction : 0
  const taxableOrdinaryIncome = Math.max(0, ordinaryIncome - deductions - standardDeductionApplied)
  const taxableCapitalGains = Math.max(0, capitalGains)
  const ordinaryTax = computeBracketTax(taxableOrdinaryIncome, policy.ordinaryBrackets)
  const capitalGainsTax = applyCapitalGainsRates
    ? computeCapitalGainsTax(taxableCapitalGains, taxableOrdinaryIncome, policy.capitalGainsBrackets)
    : computeBracketTax(taxableCapitalGains, policy.ordinaryBrackets)
  const stateTax = stateTaxRate * (taxableOrdinaryIncome + taxableCapitalGains)
  const taxOwed = ordinaryTax + capitalGainsTax + stateTax
  const magi = ordinaryIncome + capitalGains + taxExemptIncome

  return {
    taxOwed,
    magi,
    taxableOrdinaryIncome,
    taxableCapitalGains,
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
