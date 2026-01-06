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
  if (!value || value.length < 4) {
    return null
  }
  const year = Number(value.slice(0, 4))
  return Number.isFinite(year) ? year : null
}

const getAgeInMonthsAtDate = (dateOfBirth: string, dateValue: string) => {
  const birth = new Date(dateOfBirth)
  const target = new Date(dateValue)
  let months =
    (target.getFullYear() - birth.getFullYear()) * 12 +
    (target.getMonth() - birth.getMonth())
  if (target.getDate() < birth.getDate()) {
    months -= 1
  }
  return Math.max(0, months)
}

const getAgeInYearsAtDate = (dateOfBirth: string, dateValue: string) =>
  Math.max(0, Math.round((getAgeInMonthsAtDate(dateOfBirth, dateValue) / 12) * 10) / 10)

const getMonthsWorkedForYear = (
  period: FutureWorkPeriod,
  year: number,
  cutoffDate?: Date,
) => {
  const startRaw = period.startDate ? new Date(period.startDate) : null
  const endRaw = period.endDate ? new Date(period.endDate) : null
  const start =
    startRaw && !Number.isNaN(startRaw.getTime()) ? startRaw : new Date(year, 0, 1)
  const end =
    endRaw && !Number.isNaN(endRaw.getTime()) ? endRaw : new Date(year + 1, 0, 1)
  if (year < start.getFullYear() || year > end.getFullYear()) {
    return 0
  }
  let months = 0
  for (let month = 0; month < 12; month += 1) {
    const monthStart = new Date(year, month, 1)
    const monthEnd = new Date(year, month + 1, 1)
    if (monthEnd <= start) {
      continue
    }
    if (monthStart >= end) {
      continue
    }
    if (cutoffDate && monthStart >= cutoffDate) {
      continue
    }
    months += 1
  }
  return months
}

const getMonthsBeforeDateInYear = (year: number, cutoffDate: Date) => {
  if (cutoffDate.getFullYear() !== year) {
    return 12
  }
  let months = 0
  for (let month = 0; month < 12; month += 1) {
    const monthStart = new Date(year, month, 1)
    if (monthStart >= cutoffDate) {
      continue
    }
    months += 1
  }
  return months
}


const getMonthsActiveForSpendingItemInYear = (
  item: SpendingLineItem,
  year: number,
  cutoffDate?: Date,
) => {
  const startRaw = item.startDate ? new Date(item.startDate) : null
  const endRaw = item.endDate ? new Date(item.endDate) : null
  const start = startRaw && !Number.isNaN(startRaw.getTime()) ? startRaw : new Date(year, 0, 1)
  const end = endRaw && !Number.isNaN(endRaw.getTime()) ? endRaw : null
  let months = 0
  for (let month = 0; month < 12; month += 1) {
    const monthStart = new Date(year, month, 1)
    const monthEnd = new Date(year, month + 1, 1)
    if (monthEnd <= start) {
      continue
    }
    if (end && monthStart >= end) {
      continue
    }
    if (cutoffDate && monthStart >= cutoffDate) {
      continue
    }
    months += 1
  }
  return months
}


export type SsaEstimateEarningsRow = {
  year: number
  age: number
  earnings: number
  monthsWorked: number
  source: 'reported' | 'future'
  sourceLabel: string
  indexedWages: number
  includedInTop35: boolean
}

export type SsaEstimateBand = {
  label: string
  amount: number
  rate: number
  adjustedAmount: number
}

export type SsaEstimateAdjustment = {
  nraMonths: number
  claimAgeMonths: number
  monthsEarly: number
  monthsDelayed: number
  reduction: number
  creditPerMonth: number
  adjustmentFactor: number
  adjustedBenefit: number
}

export type SsaEstimateDetails = {
  claimDate: string
  claimYear: number
  claimAgeMonths: number
  earningsRows: SsaEstimateEarningsRow[]
  applicableMonths: number
  indexedWagesSum: number
  aime: number
  bendPoints: SsaBendPoint
  bands: SsaEstimateBand[]
  pia: number
  adjustment: SsaEstimateAdjustment
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

const toAnnualAmount = (
  item: SpendingLineItem,
  year: number,
  inflationAssumptions: Scenario['strategies']['returnModel']['inflationAssumptions'],
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
  const claimYear = getYearFromIsoDate(socialStrategy.startDate)
  if (birthYear === null || claimYear === null) {
    return null
  }
  const claimDate = new Date(socialStrategy.startDate)
  const hasClaimDate = !Number.isNaN(claimDate.getTime())
  const claimCutoffMonths = hasClaimDate ? getMonthsBeforeDateInYear(claimYear, claimDate) : 12
  const claimAgeMonths = Math.min(
    getAgeInMonthsAtDate(person.dateOfBirth, socialStrategy.startDate),
    70 * 12,
  )
  const filteredEarnings = earnings
    .filter((record) => record.year <= claimYear)
    .map((record) => ({
      year: record.year,
      amount: record.amount,
      months:
        record.year === claimYear
          ? Math.min(record.months, claimCutoffMonths)
          : record.months,
      source: 'reported' as const,
    }))
  const lastEarningsYear = filteredEarnings.reduce(
    (max, record) => Math.max(max, record.year),
    Number.NEGATIVE_INFINITY,
  )

  const earningsByYear = new Map<number, number>()
  const monthsByYear = new Map<number, number>()
  const sourceByYear = new Map<number, 'reported' | 'future'>()
  filteredEarnings.forEach((record) => {
    const monthsFraction = Math.max(0, Math.min(1, record.months / 12))
    earningsByYear.set(record.year, record.amount * monthsFraction)
    monthsByYear.set(record.year, record.months)
    sourceByYear.set(record.year, record.source)
  })

  const preTaxItems = spendingLineItems.filter((item) => item.isPreTax)
  const inflationAssumptions = scenario.strategies.returnModel.inflationAssumptions
  const cpiRate = inflationAssumptions.cpi ?? 0
  const currentYear = new Date().getFullYear()

  const grossByYear = new Map<number, number>()
  const monthsWorkedByYear = new Map<number, number>()

  futureWorkPeriods.forEach((period) => {
    const startYear = getYearFromIsoDate(period.startDate)
    const endYear = getYearFromIsoDate(period.endDate)
    if (endYear === null) {
      return
    }
    const effectiveStartYear = startYear ?? (Number.isFinite(lastEarningsYear) ? lastEarningsYear + 1 : endYear)
    for (let year = effectiveStartYear; year <= endYear; year += 1) {
      const monthsInYear =
        year === claimYear && hasClaimDate
          ? getMonthsWorkedForYear(period, year, claimDate)
          : getMonthsWorkedForYear(period, year)
      if (monthsInYear === 0) {
        continue
      }
      const inflationFactor = Math.pow(1 + cpiRate, year - currentYear)
      const proratedGross =
        (period.salary + period.bonus) * inflationFactor * (monthsInYear / 12)
      const currentGross = grossByYear.get(year) ?? 0
      grossByYear.set(year, currentGross + proratedGross)
      const currentMonths = monthsWorkedByYear.get(year) ?? 0
      monthsWorkedByYear.set(year, Math.min(12, currentMonths + monthsInYear))
    }
  })

  grossByYear.forEach((gross, year) => {
    if (year <= lastEarningsYear || year > claimYear) {
      return
    }
    const monthsWorked = Math.min(12, monthsWorkedByYear.get(year) ?? 0)
    const cutoff = year === claimYear && hasClaimDate ? claimDate : undefined
    const preTax = preTaxItems.reduce((total, item) => {
      const monthsActive = getMonthsActiveForSpendingItemInYear(item, year, cutoff)
      if (monthsActive <= 0) {
        return total
      }
      const annual = toAnnualAmount(item, year, inflationAssumptions)
      const cappedMonths = Math.min(monthsActive, monthsWorked)
      return total + annual * (cappedMonths / 12)
    }, 0)
    earningsByYear.set(year, Math.max(0, gross - preTax))
    monthsByYear.set(year, monthsWorked)
    sourceByYear.set(year, 'future')
  })

  const awiClaim = getAwiValue(claimYear - 2, wageIndex, cpiRate)
  if (!awiClaim) {
    return null
  }

  const indexedByYear = Array.from(earningsByYear.entries())
    .filter(([year]) => year <= claimYear)
    .map(([year, amount]) => {
      const awiYear = getAwiValue(year, wageIndex, cpiRate)
      if (!awiYear) {
        return { year, indexed: 0 }
      }
      return { year, indexed: amount * (awiClaim / awiYear) }
    })
  const top35Indexed = [...indexedByYear].sort((a, b) => b.indexed - a.indexed).slice(0, 35)
  const top35Years = new Set(top35Indexed.map((item) => item.year))
  const totalIndexedWages = top35Indexed.reduce((total, item) => total + item.indexed, 0)
  const aime = totalIndexedWages / (35 * 12)

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

  let adjustedBenefit = pia
  let reduction = 0
  let creditPerMonth = 0
  let monthsEarly = 0
  let monthsDelayed = 0
  if (claimAgeMonths < nraMonths) {
    monthsEarly = nraMonths - claimAgeMonths
    const firstSegment = Math.min(monthsEarly, 36)
    const remaining = Math.max(0, monthsEarly - 36)
    reduction = firstSegment * (5 / 9 / 100) + remaining * (5 / 12 / 100)
    adjustedBenefit = pia * (1 - reduction)
  } else if (claimAgeMonths > nraMonths && adjustment) {
    monthsDelayed = claimAgeMonths - nraMonths
    creditPerMonth = adjustment.delayedRetirementCreditPerYear / 12
    adjustedBenefit = pia * (1 + monthsDelayed * creditPerMonth)
  }

  const earningsRows: SsaEstimateEarningsRow[] = Array.from(earningsByYear.entries())
    .filter(([year]) => year <= claimYear)
    .sort(([yearA], [yearB]) => yearA - yearB)
    .map(([year, amount]) => {
      const awiYear = getAwiValue(year, wageIndex, cpiRate)
      const indexedWages = awiYear ? amount * (awiClaim / awiYear) : 0
      const source = sourceByYear.get(year) ?? 'reported'
      const sourceLabel =
        source === 'reported'
          ? 'Reported SSA earnings'
          : 'Future work period less pretax expenses'
      return {
        year,
        age: getAgeInYearsAtDate(person.dateOfBirth, `${year}-12-31`),
        earnings: amount,
        monthsWorked: monthsByYear.get(year) ?? 0,
        source,
        sourceLabel,
        indexedWages,
        includedInTop35: top35Years.has(year),
      }
    })

  const applicableRows = earningsRows.filter((row) => row.includedInTop35)
  const applicableMonths = applicableRows.reduce((total, row) => total + row.monthsWorked, 0)

  const bands: SsaEstimateBand[] = [
    { label: 'First', amount: firstPiece, rate: 0.9, adjustedAmount: firstPiece * 0.9 },
    { label: 'Second', amount: secondPiece, rate: 0.32, adjustedAmount: secondPiece * 0.32 },
    { label: 'Third', amount: thirdPiece, rate: 0.15, adjustedAmount: thirdPiece * 0.15 },
  ]

  const adjustmentFactor =
    claimAgeMonths < nraMonths
      ? 1 - reduction
      : claimAgeMonths > nraMonths && adjustment
        ? 1 + monthsDelayed * creditPerMonth
        : 1

  return {
    claimYear,
    monthlyBenefit: adjustedBenefit,
    details: {
      claimDate: socialStrategy.startDate,
      claimYear,
      claimAgeMonths,
      earningsRows,
      applicableMonths,
      indexedWagesSum: totalIndexedWages,
      aime,
      bendPoints: bend,
      bands,
      pia,
      adjustment: {
        nraMonths,
        claimAgeMonths,
        monthsEarly,
        monthsDelayed,
        reduction,
        creditPerMonth,
        adjustmentFactor,
        adjustedBenefit,
      },
    },
  }
}
