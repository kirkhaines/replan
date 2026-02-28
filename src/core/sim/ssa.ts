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
import { applyInflation } from '../utils/inflation'
import {
  getAgeInMonthsAtIsoDate,
  getYearFromIsoDate as getYearFromIsoDateUtc,
  parseIsoDateUtc,
} from '../utils/date'

export const getYearFromIsoDate = getYearFromIsoDateUtc

const getAgeInMonthsAtDate = getAgeInMonthsAtIsoDate

const getAgeInYearsAtDate = (dateOfBirth: string, dateValue: string) =>
  Math.max(0, Math.round((getAgeInMonthsAtDate(dateOfBirth, dateValue) / 12) * 10) / 10)

const getMonthsWorkedForYear = (
  period: FutureWorkPeriod,
  year: number,
  cutoffDate?: Date,
) => {
  const startRaw = parseIsoDateUtc(period.startDate)
  const endRaw = parseIsoDateUtc(period.endDate)
  const start =
    startRaw && !Number.isNaN(startRaw.getTime())
      ? startRaw
      : new Date(Date.UTC(year, 0, 1))
  const end =
    endRaw && !Number.isNaN(endRaw.getTime())
      ? endRaw
      : new Date(Date.UTC(year + 1, 0, 1))
  if (year < start.getUTCFullYear() || year > end.getUTCFullYear()) {
    return 0
  }
  let months = 0
  for (let month = 0; month < 12; month += 1) {
    const monthStart = new Date(Date.UTC(year, month, 1))
    const monthEnd = new Date(Date.UTC(year, month + 1, 1))
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
  if (cutoffDate.getUTCFullYear() !== year) {
    return 12
  }
  let months = 0
  for (let month = 0; month < 12; month += 1) {
    const monthStart = new Date(Date.UTC(year, month, 1))
    if (monthStart >= cutoffDate) {
      continue
    }
    months += 1
  }
  return months
}

const PIA_FIRST_BEND_RATE = 0.9
const PIA_SECOND_BEND_RATE = 0.32
const PIA_THIRD_BEND_RATE = 0.15

const getMonthsActiveForSpendingItemInYear = (
  item: SpendingLineItem,
  year: number,
  cutoffDate?: Date,
) => {
  const startRaw = parseIsoDateUtc(item.startDate)
  const endRaw = parseIsoDateUtc(item.endDate)
  const start =
    startRaw && !Number.isNaN(startRaw.getTime())
      ? startRaw
      : new Date(Date.UTC(year, 0, 1))
  const end = endRaw && !Number.isNaN(endRaw.getTime()) ? endRaw : null
  let months = 0
  for (let month = 0; month < 12; month += 1) {
    const monthStart = new Date(Date.UTC(year, month, 1))
    const monthEnd = new Date(Date.UTC(year, month + 1, 1))
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
const getAwiValue = (
  year: number,
  records: SsaWageIndex[],
  inflationAssumptions: Scenario['strategies']['returnModel']['inflationAssumptions'],
) => {
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
    return applyInflation({
      amount: max.index,
      inflationType: 'cpi',
      fromDateIso: `${max.year}-01-01`,
      toDateIso: `${year}-01-01`,
      assumptions: inflationAssumptions,
    })
  }
  if (year < min.year) {
    return min.index
  }
  const previous = [...sorted].reverse().find((record) => record.year < year)
  return previous?.index ?? min.index
}

const getBendPoints = (
  year: number,
  records: SsaBendPoint[],
  inflationAssumptions: Scenario['strategies']['returnModel']['inflationAssumptions'],
) => {
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
    const factor = applyInflation({
      amount: 1,
      inflationType: 'cpi',
      fromDateIso: `${max.year}-01-01`,
      toDateIso: `${year}-01-01`,
      assumptions: inflationAssumptions,
    })
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
  const monthly = item.needAmount + item.wantAmount
  return (
    applyInflation({
      amount: monthly * 12,
      inflationType: item.inflationType,
      fromDateIso: `${startYear}-01-01`,
      toDateIso: `${year}-01-01`,
      assumptions: inflationAssumptions,
    })
  )
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
  const claimDate = parseIsoDateUtc(socialStrategy.startDate)
  const claimDateOrUndefined = claimDate ?? undefined
  const claimCutoffMonths = claimDateOrUndefined
    ? getMonthsBeforeDateInYear(claimYear, claimDateOrUndefined)
    : 12
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

  const earningsByYear = new Map<
    number,
    { earnings: number; months: number; indexed: number; source: 'reported' | 'future' }
  >()
  filteredEarnings.forEach((record) => {
    earningsByYear.set(record.year, {
      earnings: record.amount,
      months: record.months,
      indexed: 0,
      source: record.source,
    })
  })

  const preTaxItems = spendingLineItems.filter((item) => item.isPreTax)
  const inflationAssumptions = scenario.strategies.returnModel.inflationAssumptions
  const currentYear = new Date().getUTCFullYear()

  futureWorkPeriods.forEach((period) => {
    const startYear = getYearFromIsoDate(period.startDate ?? undefined)
    const endYear = getYearFromIsoDate(period.endDate ?? undefined)
    if (endYear === null) {
      return
    }
    const effectiveStartYear = startYear ?? (Number.isFinite(lastEarningsYear) ? lastEarningsYear + 1 : endYear)
    for (let year = effectiveStartYear; year <= endYear; year += 1) {
      if (year <= lastEarningsYear || year > claimYear) {
        continue
      }
      const monthsInYear =
        year === claimYear && claimDateOrUndefined
          ? getMonthsWorkedForYear(period, year, claimDateOrUndefined)
          : getMonthsWorkedForYear(period, year)
      if (monthsInYear === 0) {
        continue
      }
      const inflationFactor = applyInflation({
        amount: 1,
        inflationType: 'cpi',
        fromDateIso: `${currentYear}-01-01`,
        toDateIso: `${year}-01-01`,
        assumptions: inflationAssumptions,
      })
      const proratedGross =
        (period.salary + period.bonus) * inflationFactor * (monthsInYear / 12)
      const currentRecord = earningsByYear.get(year)
      const updatedGross = (currentRecord?.earnings ?? 0) + proratedGross
      const updatedMonths = Math.min(12, (currentRecord?.months ?? 0) + monthsInYear)

      const cutoff = year === claimYear ? claimDateOrUndefined : undefined
      const preTax = preTaxItems.reduce((total, item) => {
        const monthsActive = getMonthsActiveForSpendingItemInYear(item, year, cutoff)
        if (monthsActive <= 0) {
          return total
        }
        const annual = toAnnualAmount(item, year, inflationAssumptions)
        const cappedMonths = Math.min(monthsActive, updatedMonths)
        return total + annual * (cappedMonths / 12)
      }, 0)
      earningsByYear.set(year, {
        earnings: Math.max(0, updatedGross - preTax),
        months: updatedMonths,
        indexed: currentRecord?.indexed ?? 0,
        source: 'future',
      })
    }
  })

  const awiClaim = getAwiValue(claimYear - 2, wageIndex, inflationAssumptions)
  if (!awiClaim) {
    return null
  }

  earningsByYear.forEach((record, year) => {
    if (year > claimYear) {
      return
    }
    const awiYear = getAwiValue(year, wageIndex, inflationAssumptions)
    record.indexed = awiYear ? record.earnings * (awiClaim / awiYear) : 0
  })

  const top35Indexed = Array.from(earningsByYear.entries())
    .filter(([year, record]) => year <= claimYear && record.earnings > 0)
    .sort(([, recordA], [, recordB]) => recordB.indexed - recordA.indexed)
    .slice(0, 35)
  const top35Years = new Set(top35Indexed.map(([year]) => year))
  const totalIndexedWages = top35Indexed.reduce((total, [, record]) => total + record.indexed, 0)
  const totalIncludedMonths = top35Indexed.reduce(
    (total, [, record]) => total + Math.min(12, record.months),
    0,
  )
  const aime = totalIncludedMonths > 0 ? totalIndexedWages / totalIncludedMonths : 0

  const bend = getBendPoints(claimYear, bendPoints, inflationAssumptions)
  if (!bend) {
    return null
  }

  const firstPiece = Math.min(aime, bend.first)
  const secondPiece = Math.min(Math.max(aime - bend.first, 0), bend.second - bend.first)
  const thirdPiece = Math.max(aime - bend.second, 0)
  const firstTerm = firstPiece * PIA_FIRST_BEND_RATE
  const secondTerm = secondPiece * PIA_SECOND_BEND_RATE
  const thirdTerm = thirdPiece * PIA_THIRD_BEND_RATE
  const pia = firstTerm + secondTerm + thirdTerm

  const adjustment = retirementAdjustments.find(
    (entry) => birthYear >= entry.birthYearStart && birthYear <= entry.birthYearEnd,
  )

  const nraMonths = adjustment?.normalRetirementAgeMonths ?? 67 * 12

  let adjustedBenefit = pia
  let reduction = 0
  let creditPerMonth = 0
  let monthsEarly = 0
  let monthsDelayed = 0
  let adjustmentFactor = 1
  if (claimAgeMonths < nraMonths) {
    monthsEarly = nraMonths - claimAgeMonths
    const firstSegment = Math.min(monthsEarly, 36)
    const remaining = Math.max(0, monthsEarly - 36)
    reduction = firstSegment * (5 / 9 / 100) + remaining * (5 / 12 / 100)
    adjustmentFactor = 1 - reduction
  } else if (claimAgeMonths > nraMonths && adjustment) {
    monthsDelayed = claimAgeMonths - nraMonths
    creditPerMonth = adjustment.delayedRetirementCreditPerYear / 12
    adjustmentFactor = 1 + monthsDelayed * creditPerMonth
  }
  adjustedBenefit = pia * adjustmentFactor

  const earningsRows: SsaEstimateEarningsRow[] = Array.from(earningsByYear.entries())
    .filter(([year]) => year <= claimYear)
    .sort(([yearA], [yearB]) => yearA - yearB)
    .map(([year, record]) => {
      const source = record.source
      const sourceLabel =
        source === 'reported'
          ? 'Reported SSA earnings'
          : 'Future work period less pretax expenses'
      return {
        year,
        age: getAgeInYearsAtDate(person.dateOfBirth, `${year}-12-31`),
        earnings: record.earnings,
        monthsWorked: record.months,
        source,
        sourceLabel,
        indexedWages: record.indexed,
        includedInTop35: top35Years.has(year),
      }
    })

  const bands: SsaEstimateBand[] = [
    {
      label: 'First',
      amount: firstPiece,
      rate: PIA_FIRST_BEND_RATE,
      adjustedAmount: firstTerm,
    },
    {
      label: 'Second',
      amount: secondPiece,
      rate: PIA_SECOND_BEND_RATE,
      adjustedAmount: secondTerm,
    },
    {
      label: 'Third',
      amount: thirdPiece,
      rate: PIA_THIRD_BEND_RATE,
      adjustedAmount: thirdTerm,
    },
  ]

  return {
    claimYear,
    monthlyBenefit: adjustedBenefit,
    details: {
      claimDate: socialStrategy.startDate,
      claimYear,
      claimAgeMonths,
      earningsRows,
      applicableMonths: totalIncludedMonths,
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
