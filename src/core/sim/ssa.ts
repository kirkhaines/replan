import type {
  Scenario,
  SocialSecurityEarnings,
  SpendingLineItem,
  SsaBendPoint,
  SsaRetirementAdjustment,
  SsaWageIndex,
  FutureWorkPeriod,
  Person,
  SocialSecurityStrategy,
} from '../models'

export const getYearFromIsoDate = (value?: string) => {
  if (!value) {
    return null
  }
  const year = Number(value.slice(0, 4))
  return Number.isFinite(year) ? year : null
}

const getAwiValue = (year: number, records: SsaWageIndex[], cpiRate: number) => {
  if (records.length === 0) {
    return 0
  }
  const sorted = [...records].sort((a, b) => a.year - b.year)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const exact = sorted.find((record) => record.year === year)
  if (exact) {
    return exact.index
  }
  if (year > max.year) {
    return max.index * Math.pow(1 + cpiRate, year - max.year)
  }
  if (year < min.year) {
    return min.index
  }
  const previous = [...sorted].reverse().find((record) => record.year < year)
  return previous?.index ?? min.index
}

const getBendPoints = (year: number, records: SsaBendPoint[], cpiRate: number) => {
  if (records.length === 0) {
    return null
  }
  const sorted = [...records].sort((a, b) => a.year - b.year)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const exact = sorted.find((record) => record.year === year)
  if (exact) {
    return exact
  }
  if (year > max.year) {
    const factor = Math.pow(1 + cpiRate, year - max.year)
    return { ...max, year, first: max.first * factor, second: max.second * factor }
  }
  if (year < min.year) {
    return min
  }
  const previous = [...sorted].reverse().find((record) => record.year < year)
  return previous ?? min
}

const isYearInRange = (year: number, start: number | null, end: number | null) => {
  if (start !== null && year < start) {
    return false
  }
  if (end !== null && year > end) {
    return false
  }
  return true
}

const toAnnualAmount = (
  item: SpendingLineItem,
  year: number,
  inflationAssumptions: Scenario['inflationAssumptions'],
) => {
  const startYear = getYearFromIsoDate(item.startDate) ?? year
  const yearsElapsed = Math.max(0, year - startYear)
  const rate = inflationAssumptions[item.inflationType] ?? 0
  const monthly = item.needAmount + item.wantAmount
  return monthly * 12 * Math.pow(1 + rate, yearsElapsed)
}

export const buildSsaEstimate = ({
  person,
  socialStrategy,
  scenario,
  earnings,
  futureWorkPeriods,
  spendingLineItems,
  wageIndex,
  bendPoints,
  retirementAdjustments,
}: {
  person: Person
  socialStrategy: SocialSecurityStrategy
  scenario: Scenario
  earnings: SocialSecurityEarnings[]
  futureWorkPeriods: FutureWorkPeriod[]
  spendingLineItems: SpendingLineItem[]
  wageIndex: SsaWageIndex[]
  bendPoints: SsaBendPoint[]
  retirementAdjustments: SsaRetirementAdjustment[]
}) => {
  const birthYear = getYearFromIsoDate(person.dateOfBirth)
  if (birthYear === null) {
    return null
  }
  const claimYear = birthYear + socialStrategy.startAge
  const filteredEarnings = earnings
    .filter((record) => record.year < claimYear)
    .map((record) => ({ year: record.year, amount: record.amount }))
  const lastEarningsYear = filteredEarnings.reduce(
    (max, record) => Math.max(max, record.year),
    Number.NEGATIVE_INFINITY,
  )

  const earningsByYear = new Map<number, number>()
  filteredEarnings.forEach((record) => {
    earningsByYear.set(record.year, record.amount)
  })

  const preTaxItems = spendingLineItems.filter((item) => item.isPreTax)
  const cpiRate = scenario.inflationAssumptions.cpi ?? 0

  const grossByYear = new Map<number, number>()

  futureWorkPeriods.forEach((period) => {
    const startYear = getYearFromIsoDate(period.startDate)
    const endYear = getYearFromIsoDate(period.endDate)
    if (startYear === null || endYear === null) {
      return
    }
    for (let year = startYear; year <= endYear; year += 1) {
      const currentGross = grossByYear.get(year) ?? 0
      grossByYear.set(year, currentGross + period.salary + period.bonus)
    }
  })

  grossByYear.forEach((gross, year) => {
    if (year <= lastEarningsYear || year >= claimYear) {
      return
    }
    const preTax = preTaxItems
      .filter((item) =>
        isYearInRange(
          year,
          getYearFromIsoDate(item.startDate),
          getYearFromIsoDate(item.endDate),
        ),
      )
      .reduce(
        (total, item) => total + toAnnualAmount(item, year, scenario.inflationAssumptions),
        0,
      )
    earningsByYear.set(year, Math.max(0, gross - preTax))
  })

  const awiClaim = getAwiValue(claimYear, wageIndex, cpiRate)
  if (!awiClaim) {
    return null
  }

  const indexedAmounts = Array.from(earningsByYear.entries())
    .filter(([year]) => year < claimYear)
    .map(([year, amount]) => {
      const awiYear = getAwiValue(year, wageIndex, cpiRate)
      if (!awiYear) {
        return 0
      }
      return amount * (awiClaim / awiYear)
    })
    .sort((a, b) => b - a)

  const top35 = [...indexedAmounts]
  while (top35.length < 35) {
    top35.push(0)
  }
  const aime = top35.slice(0, 35).reduce((total, amount) => total + amount, 0) / (35 * 12)

  const bend = getBendPoints(claimYear, bendPoints, cpiRate)
  if (!bend) {
    return null
  }

  const firstPiece = Math.min(aime, bend.first)
  const secondPiece = Math.min(Math.max(aime - bend.first, 0), bend.second - bend.first)
  const thirdPiece = Math.max(aime - bend.second, 0)
  const pia = firstPiece * 0.9 + secondPiece * 0.32 + thirdPiece * 0.15

  const adjustment = retirementAdjustments.find(
    (entry) => birthYear >= entry.birthYearStart && birthYear <= entry.birthYearEnd,
  )

  const nraMonths = adjustment?.normalRetirementAgeMonths ?? 67 * 12
  const claimAgeMonths = Math.min(Math.round(socialStrategy.startAge * 12), 70 * 12)

  let adjustedBenefit = pia
  if (claimAgeMonths < nraMonths) {
    const monthsEarly = nraMonths - claimAgeMonths
    const firstSegment = Math.min(monthsEarly, 36)
    const remaining = Math.max(0, monthsEarly - 36)
    const reduction =
      firstSegment * (5 / 9 / 100) + remaining * (5 / 12 / 100)
    adjustedBenefit = pia * (1 - reduction)
  } else if (claimAgeMonths > nraMonths && adjustment) {
    const monthsDelayed = claimAgeMonths - nraMonths
    const creditPerMonth = adjustment.delayedRetirementCreditPerYear / 12
    adjustedBenefit = pia * (1 + monthsDelayed * creditPerMonth)
  }

  return {
    claimYear,
    monthlyBenefit: adjustedBenefit,
  }
}
