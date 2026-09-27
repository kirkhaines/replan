import { describe, expect, it } from 'vitest'
import { buildSsaEstimate } from './ssa'
import {
  ssaBendPointSeed,
  ssaRetirementAdjustmentSeed,
  ssaWageIndexSeed,
} from '../defaults/defaultData'
import type {
  Person,
  Scenario,
  SocialSecurityEarnings,
  SocialSecurityStrategy,
  SsaBendPoint,
  SsaRetirementAdjustment,
  SsaWageIndex,
} from '../models'
import { buildScenario } from '../../test/scenarioFactory'

const ssaWageIndex: SsaWageIndex[] = ssaWageIndexSeed.map((seed, index) => ({
  id: `wi-${index}`,
  year: seed.year,
  index: seed.index,
  createdAt: 0,
  updatedAt: 0,
}))

const ssaBendPoints: SsaBendPoint[] = ssaBendPointSeed.map((seed, index) => ({
  id: `bp-${index}`,
  year: seed.year,
  first: seed.first,
  second: seed.second,
  createdAt: 0,
  updatedAt: 0,
}))

const ssaRetirementAdjustments: SsaRetirementAdjustment[] = ssaRetirementAdjustmentSeed.map(
  (seed, index) => ({
    id: `ra-${index}`,
    birthYearStart: seed.birthYearStart,
    birthYearEnd: seed.birthYearEnd,
    normalRetirementAgeMonths: seed.normalRetirementAgeMonths,
    delayedRetirementCreditPerYear: seed.delayedRetirementCreditPerYear,
    createdAt: 0,
    updatedAt: 0,
  }),
)

const makePerson = (dateOfBirth: string): Person => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Jane Doe',
  dateOfBirth,
  lifeExpectancy: 90,
  createdAt: 0,
  updatedAt: 0,
})

const makeSocialStrategy = (startDate: string): SocialSecurityStrategy => ({
  id: '00000000-0000-4000-8000-000000000002',
  personId: '00000000-0000-4000-8000-000000000001',
  startDate,
  createdAt: 0,
  updatedAt: 0,
})

const makeEarnings = (
  yearsWithEarnings: Array<{ year: number; amount: number; months?: number }>,
): SocialSecurityEarnings[] =>
  yearsWithEarnings.map(({ year, amount, months = 12 }) => ({
    id: `earning-${year}`,
    personId: '00000000-0000-4000-8000-000000000001',
    year,
    amount,
    months,
    createdAt: 0,
    updatedAt: 0,
  }))

const baseScenario: Scenario = {
  ...buildScenario(),
  strategies: {
    ...buildScenario().strategies,
    returnModel: {
      ...buildScenario().strategies.returnModel,
      inflationAssumptions: {
        none: 0,
        cpi: 0.025,
        medical: 0.04,
        housing: 0.03,
        education: 0.05,
      },
    },
  },
}

describe('buildSsaEstimate', () => {
  it('divides top 35 years by 420 months (35 years) even when worker has fewer than 35 years', () => {
    // Person born Jan 1, 1964 -> age 60 in 2024, age 62 in 2026, claims at 67 on 2031-01-01
    const person = makePerson('1964-01-01')
    const socialStrategy = makeSocialStrategy('2031-01-01')

    // Exactly 10 years of earnings of $84,000 each (from 2014 to 2023)
    const earnings = makeEarnings([
      { year: 2014, amount: 84000 },
      { year: 2015, amount: 84000 },
      { year: 2016, amount: 84000 },
      { year: 2017, amount: 84000 },
      { year: 2018, amount: 84000 },
      { year: 2019, amount: 84000 },
      { year: 2020, amount: 84000 },
      { year: 2021, amount: 84000 },
      { year: 2022, amount: 84000 },
      { year: 2023, amount: 84000 },
    ])

    const estimate = buildSsaEstimate({
      person,
      socialStrategy,
      scenario: baseScenario,
      earnings,
      futureWorkPeriods: [],
      spendingLineItems: [],
      wageIndex: ssaWageIndex,
      bendPoints: ssaBendPoints,
      retirementAdjustments: ssaRetirementAdjustments,
    })

    expect(estimate).not.toBeNull()
    const details = estimate!.details
    // Computation months must strictly be 420 (35 years * 12 months), NOT 120 (10 years)
    expect(details.applicableMonths).toBe(420)
    // AIME must be calculated using 420 months divisor
    expect(details.aime).toBe(Math.floor(details.indexedWagesSum / 420))
    // All 10 years are included in top 35
    const includedRows = details.earningsRows.filter((row) => row.includedInTop35)
    expect(includedRows.length).toBe(10)
  })

  it('does not reduce the 420 computation months when a year has fewer than 12 months worked', () => {
    const person = makePerson('1964-01-01')
    const socialStrategy = makeSocialStrategy('2031-01-01')

    // 10 years, some with partial worked months (e.g., 6 months)
    const earnings = makeEarnings([
      { year: 2014, amount: 40000, months: 6 },
      { year: 2015, amount: 50000, months: 8 },
      { year: 2016, amount: 84000, months: 12 },
    ])

    const estimate = buildSsaEstimate({
      person,
      socialStrategy,
      scenario: baseScenario,
      earnings,
      futureWorkPeriods: [],
      spendingLineItems: [],
      wageIndex: ssaWageIndex,
      bendPoints: ssaBendPoints,
      retirementAdjustments: ssaRetirementAdjustments,
    })

    expect(estimate).not.toBeNull()
    const details = estimate!.details
    // Divisor must still be 420, not 6 + 8 + 12 = 26
    expect(details.applicableMonths).toBe(420)
    expect(details.aime).toBe(Math.floor(details.indexedWagesSum / 420))
  })

  it('does not index earnings at age 60 and later (indexing factor = 1.0)', () => {
    // Person born Jan 1, 1964 -> age 60 in 2024
    const person = makePerson('1964-01-01')
    const socialStrategy = makeSocialStrategy('2031-01-01')

    const earnings = makeEarnings([
      { year: 2023, amount: 70000 }, // age 59 -> indexed
      { year: 2024, amount: 80000 }, // age 60 -> not indexed (factor 1.0)
      { year: 2025, amount: 90000 }, // age 61 -> not indexed (factor 1.0)
    ])

    const estimate = buildSsaEstimate({
      person,
      socialStrategy,
      scenario: baseScenario,
      earnings,
      futureWorkPeriods: [],
      spendingLineItems: [],
      wageIndex: ssaWageIndex,
      bendPoints: ssaBendPoints,
      retirementAdjustments: ssaRetirementAdjustments,
    })

    expect(estimate).not.toBeNull()
    const rows = estimate!.details.earningsRows
    const row2023 = rows.find((r) => r.year === 2023)!
    const row2024 = rows.find((r) => r.year === 2024)!
    const row2025 = rows.find((r) => r.year === 2025)!

    // 2023 earnings are indexed (AWI 2024 / AWI 2023 > 1)
    expect(row2023.indexedWages).toBeGreaterThan(row2023.earnings)
    // 2024 and 2025 earnings are unindexed (indexedWages == earnings)
    expect(row2024.indexedWages).toBe(row2024.earnings)
    expect(row2025.indexedWages).toBe(row2025.earnings)
  })

  it('selects only the top 35 years when a worker has more than 35 years of earnings', () => {
    const person = makePerson('1960-01-01')
    const socialStrategy = makeSocialStrategy('2027-01-01')

    // Generate 40 years of earnings (1985 to 2024)
    // First 5 years are low earnings ($5,000), rest are high ($100,000)
    const earningsList: Array<{ year: number; amount: number }> = []
    for (let y = 1985; y <= 1989; y += 1) {
      earningsList.push({ year: y, amount: 5000 })
    }
    for (let y = 1990; y <= 2024; y += 1) {
      earningsList.push({ year: y, amount: 100000 })
    }
    const earnings = makeEarnings(earningsList)

    const estimate = buildSsaEstimate({
      person,
      socialStrategy,
      scenario: baseScenario,
      earnings,
      futureWorkPeriods: [],
      spendingLineItems: [],
      wageIndex: ssaWageIndex,
      bendPoints: ssaBendPoints,
      retirementAdjustments: ssaRetirementAdjustments,
    })

    expect(estimate).not.toBeNull()
    const rows = estimate!.details.earningsRows
    const includedCount = rows.filter((r) => r.includedInTop35).length
    expect(includedCount).toBe(35)

    // The lowest 5 years should not be in top 35
    for (let y = 1985; y <= 1989; y += 1) {
      const row = rows.find((r) => r.year === y)!
      expect(row.includedInTop35).toBe(false)
    }
  })

  it('handles 0 years of earnings gracefully returning zero benefit', () => {
    const person = makePerson('1964-01-01')
    const socialStrategy = makeSocialStrategy('2031-01-01')

    const estimate = buildSsaEstimate({
      person,
      socialStrategy,
      scenario: baseScenario,
      earnings: [],
      futureWorkPeriods: [],
      spendingLineItems: [],
      wageIndex: ssaWageIndex,
      bendPoints: ssaBendPoints,
      retirementAdjustments: ssaRetirementAdjustments,
    })

    expect(estimate).not.toBeNull()
    expect(estimate!.monthlyBenefit).toBe(0)
    expect(estimate!.details.aime).toBe(0)
    expect(estimate!.details.pia).toBe(0)
    expect(estimate!.details.applicableMonths).toBe(420)
  })

  it('correctly applies early claiming reduction when claiming at 62 before NRA 67', () => {
    // Person born 1964 -> NRA = 67 (804 months). Claim at 62 (744 months) -> 60 months early.
    // First 36 months: 36 * (5/9)% = 20%. Remaining 24 months: 24 * (5/12)% = 10%. Total reduction = 30%.
    const person = makePerson('1964-01-01')
    const socialStrategy = makeSocialStrategy('2026-01-01') // age 62

    const earnings = makeEarnings([
      { year: 2020, amount: 100000 },
      { year: 2021, amount: 100000 },
      { year: 2022, amount: 100000 },
    ])

    const estimate = buildSsaEstimate({
      person,
      socialStrategy,
      scenario: baseScenario,
      earnings,
      futureWorkPeriods: [],
      spendingLineItems: [],
      wageIndex: ssaWageIndex,
      bendPoints: ssaBendPoints,
      retirementAdjustments: ssaRetirementAdjustments,
    })

    expect(estimate).not.toBeNull()
    const adj = estimate!.details.adjustment
    expect(adj.monthsEarly).toBe(60)
    expect(adj.reduction).toBeCloseTo(0.30, 4)
    expect(adj.adjustmentFactor).toBeCloseTo(0.70, 4)
    expect(estimate!.monthlyBenefit).toBe(Math.floor(estimate!.details.pia * 0.70))
  })

  it('correctly applies delayed retirement credits past NRA 67 up to age 70', () => {
    // Person born 1960 -> NRA = 67. Claim at 70 (2030-01-01) -> 36 months delayed.
    // 36 months * (8% / 12) = 24% credit. Adjustment factor = 1.24.
    const person = makePerson('1960-01-01')
    const socialStrategy = makeSocialStrategy('2030-01-01') // age 70

    const earnings = makeEarnings([
      { year: 2018, amount: 100000 },
      { year: 2019, amount: 100000 },
    ])

    const estimate = buildSsaEstimate({
      person,
      socialStrategy,
      scenario: baseScenario,
      earnings,
      futureWorkPeriods: [],
      spendingLineItems: [],
      wageIndex: ssaWageIndex,
      bendPoints: ssaBendPoints,
      retirementAdjustments: ssaRetirementAdjustments,
    })

    expect(estimate).not.toBeNull()
    const adj = estimate!.details.adjustment
    expect(adj.monthsDelayed).toBe(36)
    expect(adj.adjustmentFactor).toBeCloseTo(1.24, 4)
    expect(estimate!.monthlyBenefit).toBe(Math.floor(estimate!.details.pia * 1.24))
  })
})
