import { describe, expect, it } from 'vitest'
import { applyHoldingWithdrawal, IRS_72T_DEFERRAL_INTEREST_RATE } from './engine'
import type { MonthTotals, SimulationContext, SimulationState } from './types'
import type { InvestmentAccountHolding, SimulationSnapshot } from '../models'
import { createDefaultScenarioStrategies } from '../models'

const makeHolding = (
  id: string,
  taxType: 'traditional' | 'roth' | 'taxable',
  balance: number,
): InvestmentAccountHolding => ({
  id,
  investmentAccountId: 'acc-1',
  name: `Holding ${id}`,
  holdingType: 'sp500',
  taxType,
  balance,
  returnRate: 0.05,
  returnStdDev: 0.1,
  costBasisEntries: [],
  createdAt: 0,
  updatedAt: 0,
})

const makeTotals = (): MonthTotals => ({
  income: 0,
  spending: 0,
  contributions: 0,
  withdrawals: 0,
  taxes: 0,
  ordinaryIncome: 0,
  capitalGains: 0,
  deductions: 0,
})

const makeContext = (
  snapshot: SimulationSnapshot,
  age: number,
  yearIndex = 0,
): SimulationContext => ({
  snapshot,
  settings: {
    startDate: '2026-01-01',
    endDate: '2036-12-31',
    months: 120,
    stepMonths: 1,
    summaryOnly: false,
  },
  monthIndex: yearIndex * 12,
  yearIndex,
  age,
  date: new Date('2026-01-01T00:00:00Z'),
  dateIso: '2026-01-01',
  isStartOfYear: true,
  isEndOfYear: false,
  planMode: 'apply',
  summaryOnly: false,
})

const makeSnapshot = (
  seppOverrides?: Partial<ReturnType<typeof createDefaultScenarioStrategies>['sepp72t']>,
): SimulationSnapshot => {
  const defaultStrategies = createDefaultScenarioStrategies()
  return {
    scenario: {
      id: 'sc-1',
      name: 'Test Scenario',
      personStrategyIds: ['ps-1'],
      nonInvestmentAccountIds: ['cash-1'],
      investmentAccountIds: ['acc-1'],
      spendingStrategyId: 'sp-1',
      strategies: {
        ...defaultStrategies,
        earlyRetirement: {
          ...defaultStrategies.earlyRetirement,
          enabled: true,
          penaltyRate: 0.1,
        },
        sepp72t: {
          ...defaultStrategies.sepp72t,
          enabled: true,
          startAge: 50,
          annualDistribution: 20000,
          ...seppOverrides,
        },
      },
      createdAt: 0,
      updatedAt: 0,
    },
    people: [],
    personStrategies: [],
    socialSecurityStrategies: [],
    socialSecurityEarnings: [],
    futureWorkStrategies: [],
    futureWorkPeriods: [],
    spendingStrategies: [],
    spendingLineItems: [],
  } as unknown as SimulationSnapshot
}

const makeState = (holdings: InvestmentAccountHolding[]): SimulationState =>
  ({
    cashAccounts: [{ id: 'cash-1', balance: 5000, interestRate: 0 }],
    holdings: holdings.map((h) => ({
      id: h.id,
      investmentAccountId: h.investmentAccountId,
      name: h.name,
      holdingType: h.holdingType,
      taxType: h.taxType,
      balance: h.balance,
      costBasisEntries: [],
      returnRate: h.returnRate,
      returnStdDev: h.returnStdDev,
      taxableDistributionYield: 0,
    })),
    investmentAccounts: [
      {
        id: 'acc-1',
        contributionEntries: [],
      },
    ],
    yearLedger: {
      ordinaryIncome: 0,
      capitalGains: 0,
      deductions: 0,
      taxExemptIncome: 0,
      socialSecurityBenefits: 0,
      earnedIncome: 0,
      penalties: 0,
      taxPaid: 0,
    },
    yearContributionsByTaxType: {
      cash: 0,
      taxable: 0,
      traditional: 0,
      roth: 0,
      hsa: 0,
    },
    initialBalance: 5000 + holdings.reduce((sum, h) => sum + h.balance, 0),
    sepp72tState: {
      isBusted: false,
      distributions: [],
    },
  }) as unknown as SimulationState

describe('applyHoldingWithdrawal with 72(t) rules and penalties', () => {
  it('records penalty-free distribution for compliant 72(t) withdrawals during active window', () => {
    const snapshot = makeSnapshot({ startAge: 50, annualDistribution: 20000 })
    const state = makeState([makeHolding('trad-1', 'traditional', 100000)])
    const totals = makeTotals()
    const context = makeContext(snapshot, 50, 0)

    const applied = applyHoldingWithdrawal(
      state,
      'trad-1',
      20000,
      totals,
      context,
      'ordinary',
      true, // skipPenalty
      false,
      true, // isSeppDistribution
    )

    expect(applied).toBe(20000)
    expect(state.holdings[0].balance).toBe(80000)
    expect(state.yearLedger.penalties).toBe(0)
    expect(state.sepp72tState?.isBusted).toBe(false)
    expect(state.sepp72tState?.distributions).toHaveLength(1)
    expect(state.sepp72tState?.distributions[0]).toEqual({
      year: 0,
      age: 50,
      amount: 20000,
      dateIso: '2026-01-01',
      holdingId: 'trad-1',
    })
  })

  it('busts plan and applies 10% recapture tax + deferral interest on prior distributions plus 10% penalty on current withdrawal', () => {
    const snapshot = makeSnapshot({ startAge: 50, annualDistribution: 20000 })
    const state = makeState([makeHolding('trad-1', 'traditional', 60000)])
    // Populate two prior compliant distributions
    state.sepp72tState = {
      isBusted: false,
      distributions: [
        { year: 0, age: 50, amount: 20000, dateIso: '2026-01-01', holdingId: 'trad-1' },
        { year: 1, age: 51, amount: 20000, dateIso: '2027-01-01', holdingId: 'trad-1' },
      ],
    }

    // Now in year 2 (age 52): Unauthorized withdrawal of $10,000 from traditional account
    const totals = makeTotals()
    const context = makeContext(snapshot, 52, 2)

    const applied = applyHoldingWithdrawal(
      state,
      'trad-1',
      10000,
      totals,
      context,
      'ordinary',
      false, // skipPenalty is false
      false,
      false, // non-72(t) withdrawal
    )

    expect(applied).toBe(10000)
    expect(state.sepp72tState?.isBusted).toBe(true)
    expect(state.sepp72tState?.bustedYear).toBe(2)

    // Calculations:
    // Year 0 dist: amount $20,000, penalty = $2,000. Deferral = 2 years.
    // Interest = 2,000 * ((1 + 0.06)^2 - 1) = 2,000 * 0.1236 = 247.20
    // Recapture 0 = 2,247.20
    //
    // Year 1 dist: amount $20,000, penalty = $2,000. Deferral = 1 year.
    // Interest = 2,000 * ((1 + 0.06)^1 - 1) = 2,000 * 0.06 = 120.00
    // Recapture 1 = 2,120.00
    //
    // Current withdrawal: $10,000 at age 52 (< 59.5).
    // Penalty = 10,000 * 0.10 = 1,000.00
    //
    // Total penalties = 2,247.20 + 2,120.00 + 1,000.00 = 5,367.20
    const expectedYear0 = 20000 * 0.1 * Math.pow(1 + IRS_72T_DEFERRAL_INTEREST_RATE, 2)
    const expectedYear1 = 20000 * 0.1 * Math.pow(1 + IRS_72T_DEFERRAL_INTEREST_RATE, 1)
    const expectedCurrent = 10000 * 0.1
    const expectedTotal = expectedYear0 + expectedYear1 + expectedCurrent

    expect(state.yearLedger.penalties).toBeCloseTo(expectedTotal, 2)
  })

  it('recaptures distributions in the same year with 0 deferral interest', () => {
    const snapshot = makeSnapshot({ startAge: 50, annualDistribution: 20000 })
    const state = makeState([makeHolding('trad-1', 'traditional', 80000)])
    // Prior distribution in the same year (year 0, month 0)
    state.sepp72tState = {
      isBusted: false,
      distributions: [
        { year: 0, age: 50, amount: 20000, dateIso: '2026-01-01', holdingId: 'trad-1' },
      ],
    }

    // Later in same year (year 0, month 5): Unauthorized withdrawal of $5,000
    const totals = makeTotals()
    const context = makeContext(snapshot, 50, 0)

    applyHoldingWithdrawal(
      state,
      'trad-1',
      5000,
      totals,
      context,
      'ordinary',
      false,
      false,
      false,
    )

    expect(state.sepp72tState?.isBusted).toBe(true)
    // Deferral years = 0 -> interest is 0.
    // Recapture on $20,000 = $2,000.
    // Penalty on $5,000 current = $500.
    // Total = $2,500.
    expect(state.yearLedger.penalties).toBe(2500)
  })

  it('handles violation after age 59.5 within 5-year period (e.g. started at 57, violation at 60)', () => {
    const snapshot = makeSnapshot({ startAge: 57, annualDistribution: 15000 })
    const state = makeState([makeHolding('trad-1', 'traditional', 100000)])
    state.sepp72tState = {
      isBusted: false,
      distributions: [
        { year: 0, age: 57, amount: 15000, dateIso: '2026-01-01', holdingId: 'trad-1' },
        { year: 1, age: 58, amount: 15000, dateIso: '2027-01-01', holdingId: 'trad-1' },
        { year: 2, age: 59, amount: 15000, dateIso: '2028-01-01', holdingId: 'trad-1' },
        { year: 3, age: 60, amount: 15000, dateIso: '2029-01-01', holdingId: 'trad-1' }, // taken at age 60 (>= 59.5)
      ],
    }

    // At age 60 (year 3): Unauthorized withdrawal of $10,000.
    // 5-year window requires continuation to age 62 (57 + 5).
    const totals = makeTotals()
    const context = makeContext(snapshot, 60, 3)

    applyHoldingWithdrawal(
      state,
      'trad-1',
      10000,
      totals,
      context,
      'ordinary',
      false,
      false,
      false,
    )

    expect(state.sepp72tState?.isBusted).toBe(true)

    // Distributions before 59.5 (years 0, 1, 2) are recaptured with deferral interest:
    const year0 = 15000 * 0.1 * Math.pow(1 + IRS_72T_DEFERRAL_INTEREST_RATE, 3)
    const year1 = 15000 * 0.1 * Math.pow(1 + IRS_72T_DEFERRAL_INTEREST_RATE, 2)
    const year2 = 15000 * 0.1 * Math.pow(1 + IRS_72T_DEFERRAL_INTEREST_RATE, 1)
    // Year 3 distribution was taken at age 60 (>= 59.5), so it would not have been subject to penalty.
    // Current withdrawal is at age 60 (>= 59.5), so no early penalty on current withdrawal.
    const expectedTotal = year0 + year1 + year2

    expect(state.yearLedger.penalties).toBeCloseTo(expectedTotal, 2)
  })

  it('does not bust plan or apply penalties when withdrawal is from taxable holding', () => {
    const snapshot = makeSnapshot({ startAge: 50, annualDistribution: 20000 })
    const state = makeState([
      makeHolding('trad-1', 'traditional', 100000),
      makeHolding('tax-1', 'taxable', 50000),
    ])
    state.sepp72tState = {
      isBusted: false,
      distributions: [
        { year: 0, age: 50, amount: 20000, dateIso: '2026-01-01', holdingId: 'trad-1' },
      ],
    }

    const totals = makeTotals()
    const context = makeContext(snapshot, 51, 1)

    applyHoldingWithdrawal(
      state,
      'tax-1',
      10000,
      totals,
      context,
      undefined,
      false,
      false,
      false,
    )

    expect(state.sepp72tState?.isBusted).toBe(false)
    expect(state.yearLedger.penalties).toBe(0)
  })

  it('does not bust plan when unauthorized withdrawal occurs after 72(t) commitment is completed', () => {
    // Started at 50, end age is max(59.5, 55) = 59.5.
    const snapshot = makeSnapshot({ startAge: 50, annualDistribution: 20000 })
    const state = makeState([makeHolding('trad-1', 'traditional', 100000)])
    state.sepp72tState = {
      isBusted: false,
      distributions: [
        { year: 0, age: 50, amount: 20000, dateIso: '2026-01-01', holdingId: 'trad-1' },
      ],
    }

    // Now age 60 (commitment completed)
    const totals = makeTotals()
    const context = makeContext(snapshot, 60, 10)

    applyHoldingWithdrawal(
      state,
      'trad-1',
      25000,
      totals,
      context,
      'ordinary',
      false,
      false,
      false,
    )

    expect(state.sepp72tState?.isBusted).toBe(false)
    expect(state.yearLedger.penalties).toBe(0)
  })

  it('does not re-apply recapture tax on subsequent withdrawals once busted', () => {
    const snapshot = makeSnapshot({ startAge: 50, annualDistribution: 20000 })
    const state = makeState([makeHolding('trad-1', 'traditional', 100000)])
    state.sepp72tState = {
      isBusted: true,
      bustedYear: 1,
      distributions: [
        { year: 0, age: 50, amount: 20000, dateIso: '2026-01-01', holdingId: 'trad-1' },
      ],
    }

    // Withdrawal in year 2 at age 52 after already being busted in year 1
    const totals = makeTotals()
    const context = makeContext(snapshot, 52, 2)

    applyHoldingWithdrawal(
      state,
      'trad-1',
      10000,
      totals,
      context,
      'ordinary',
      false,
      false,
      false,
    )

    // Only the current withdrawal penalty of 10% ($1,000) should be applied, NO recapture tax
    expect(state.yearLedger.penalties).toBe(1000)
  })

  it('does not bust 72(t) plan and does not assess penalties on Roth conversion under Treas. Reg. § 1.408A-4, Q&A-12', () => {
    const snapshot = makeSnapshot({ startAge: 50, annualDistribution: 20000 })
    const state = makeState([
      makeHolding('trad-1', 'traditional', 100000),
      makeHolding('roth-1', 'roth', 0),
    ])
    state.sepp72tState = {
      isBusted: false,
      distributions: [
        { year: 0, age: 50, amount: 20000, dateIso: '2026-01-01', holdingId: 'trad-1' },
      ],
    }

    // Roth conversion from traditional in year 1 (age 51) with skipPenalty: true, isConversion: true
    const totals = makeTotals()
    const context = makeContext(snapshot, 51, 1)

    applyHoldingWithdrawal(
      state,
      'trad-1',
      10000,
      totals,
      context,
      'ordinary',
      true, // skipPenalty is true for Roth conversion
      false,
      false,
      true, // isConversion: true
    )

    // Under Treas. Reg. § 1.408A-4, Q&A-12, a Roth conversion does NOT constitute a modification under IRC §72(t)(4)
    expect(state.sepp72tState?.isBusted).toBe(false)
    expect(state.yearLedger.penalties).toBe(0)
  })
})
