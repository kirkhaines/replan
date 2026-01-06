import { describe, expect, it } from 'vitest'
import type { IrmaaTable, TaxPolicy } from '../models'
import { computeIrmaaSurcharge, computeTax, selectTaxPolicy } from './tax'

describe('tax helpers', () => {
  it('selects the nearest prior policy year', () => {
    const policies: TaxPolicy[] = [
      {
        year: 2022,
        filingStatus: 'single',
        standardDeduction: 10000,
        ordinaryBrackets: [{ upTo: null, rate: 0.1 }],
        capitalGainsBrackets: [{ upTo: null, rate: 0 }],
      },
      {
        year: 2024,
        filingStatus: 'single',
        standardDeduction: 12000,
        ordinaryBrackets: [{ upTo: null, rate: 0.12 }],
        capitalGainsBrackets: [{ upTo: null, rate: 0 }],
      },
    ]

    const selected = selectTaxPolicy(policies, 2023, 'single')
    expect(selected?.year).toBe(2022)
  })

  it('computes ordinary and capital gains tax', () => {
    const policy: TaxPolicy = {
      year: 2024,
      filingStatus: 'single',
      standardDeduction: 0,
      ordinaryBrackets: [
        { upTo: 10000, rate: 0.1 },
        { upTo: null, rate: 0.2 },
      ],
      capitalGainsBrackets: [
        { upTo: 5000, rate: 0 },
        { upTo: 20000, rate: 0.1 },
        { upTo: null, rate: 0.2 },
      ],
    }

    const result = computeTax({
      ordinaryIncome: 15000,
      capitalGains: 6000,
      deductions: 0,
      taxExemptIncome: 0,
      stateTaxRate: 0,
      policy,
      useStandardDeduction: false,
      applyCapitalGainsRates: true,
    })

    expect(result.taxOwed).toBeCloseTo(2700, 5)
    expect(result.magi).toBe(21000)
  })

  it('uses the correct IRMAA tier', () => {
    const table: IrmaaTable = {
      year: 2024,
      filingStatus: 'single',
      lookbackYears: 2,
      tiers: [
        { maxMagi: 100000, partBMonthly: 100, partDMonthly: 10 },
        { maxMagi: 150000, partBMonthly: 200, partDMonthly: 20 },
        { maxMagi: null, partBMonthly: 300, partDMonthly: 30 },
      ],
    }

    const surcharge = computeIrmaaSurcharge(table, 120000)
    expect(surcharge.partBMonthly).toBe(200)
    expect(surcharge.partDMonthly).toBe(20)
  })
})
