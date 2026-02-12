import type { Scenario, SimulationRun, SimulationSnapshot } from '../models'
import { inflationTypeSchema } from '../models/enums'
import type { SimulationInput } from '../sim/input'
import { createSeededRandom, hashStringToSeed, randomNormal } from '../sim/random'
import { addMonthsUtc, monthsBetweenIsoDates, parseIsoDateUtc } from './date'

export type InflationType = (typeof inflationTypeSchema.options)[number]
export type InflationAssumptions =
  Scenario['strategies']['returnModel']['inflationAssumptions']
export type InflationRateByYear =
  | Record<number, number>
  | Record<number, Partial<Record<InflationType, number>>>
  | Map<number, number>
  | Map<number, Partial<Record<InflationType, number>>>
export type InflationIndexByType = Record<InflationType, number[]>

type InflationContext = {
  assumptions?: InflationAssumptions
  scenario?: Scenario
  snapshot?: SimulationSnapshot
  run?: SimulationRun | null
  ratesByYear?: InflationRateByYear
  indexByType?: InflationIndexByType
  indexStartDateIso?: string
}

export const parseIsoDate = parseIsoDateUtc

export const monthsBetween = monthsBetweenIsoDates

export const toMonthlyRate = (annualRate: number) => Math.pow(1 + annualRate, 1 / 12) - 1

export const buildInflationIndexByType = (
  snapshot: SimulationInput['snapshot'],
  settings: SimulationInput['settings'],
) => {
  const returnModel = snapshot.scenario.strategies.returnModel
  const assumptions = returnModel.inflationAssumptions
  const months = Math.max(0, settings.months)
  const stdev = returnModel.inflationStdev ?? 0
  const useStochastic = returnModel.mode === 'stochastic' && stdev > 0
  const useAnnualShocks = returnModel.sequenceModel === 'regime'
  const annualPersistence = Math.min(1, Math.max(0, returnModel.inflationPersistence ?? 0))
  // Convert annual persistence to a monthly coefficient so a 12-month lag matches the annual factor.
  const persistence = useAnnualShocks
    ? annualPersistence
    : Math.pow(annualPersistence, 1 / 12)
  const innovationScale = Math.sqrt(Math.max(0, 1 - persistence * persistence))
  const baseSeed =
    returnModel.seed ?? hashStringToSeed(`${snapshot.scenario.id}:${settings.startDate}`)
  const indexByType = {} as Record<InflationType, number[]>
  const shocksByMonth: number[] = []

  if (useStochastic) {
    const random = createSeededRandom(hashStringToSeed(`${baseSeed}:inflation`))
    if (useAnnualShocks) {
      const startDate = parseIsoDate(settings.startDate)
      if (startDate) {
        const yearIndexByMonth: number[] = new Array(months)
        const yearIndexByValue = new Map<number, number>()
        const years: number[] = []
        for (let month = 0; month < months; month += 1) {
          const date = addMonthsUtc(startDate, month)
          const year = date.getUTCFullYear()
          let yearIndex = yearIndexByValue.get(year)
          if (yearIndex === undefined) {
            yearIndex = years.length
            years.push(year)
            yearIndexByValue.set(year, yearIndex)
          }
          yearIndexByMonth[month] = yearIndex
        }
        if (years.length > 0) {
          const shocksByYear = new Array(years.length)
          let previousShock = randomNormal(random)
          shocksByYear[0] = previousShock
          for (let yearIndex = 1; yearIndex < years.length; yearIndex += 1) {
            const innovation = randomNormal(random)
            const shock = persistence * previousShock + innovationScale * innovation
            shocksByYear[yearIndex] = shock
            previousShock = shock
          }
          for (let month = 0; month < months; month += 1) {
            shocksByMonth[month] = shocksByYear[yearIndexByMonth[month]] ?? 0
          }
        }
      } else {
        const periodCount = Math.max(1, Math.ceil(months / 12))
        const shocksByYear = new Array(periodCount)
        let previousShock = randomNormal(random)
        shocksByYear[0] = previousShock
        for (let yearIndex = 1; yearIndex < periodCount; yearIndex += 1) {
          const innovation = randomNormal(random)
          const shock = persistence * previousShock + innovationScale * innovation
          shocksByYear[yearIndex] = shock
          previousShock = shock
        }
        for (let month = 0; month < months; month += 1) {
          shocksByMonth[month] = shocksByYear[Math.floor(month / 12)] ?? 0
        }
      }
    } else {
      const periodCount = months
      if (periodCount > 0) {
        const shocksByPeriod = new Array(periodCount)
        let previousShock = randomNormal(random)
        shocksByPeriod[0] = previousShock
        for (let period = 1; period < periodCount; period += 1) {
          const innovation = randomNormal(random)
          const shock = persistence * previousShock + innovationScale * innovation
          shocksByPeriod[period] = shock
          previousShock = shock
        }
        for (let month = 0; month < months; month += 1) {
          shocksByMonth[month] = shocksByPeriod[month] ?? 0
        }
      }
    }
  }

  inflationTypeSchema.options.forEach((type) => {
    const index = new Array(months + 1)
    index[0] = 1
    let factor = 1
    const baseRate = assumptions[type] ?? 0
    if (useStochastic) {
      for (let month = 0; month < months; month += 1) {
        const shock = shocksByMonth[month] ?? 0
        const annualRate = Math.max(-0.95, baseRate + shock * stdev)
        factor *= 1 + toMonthlyRate(annualRate)
        index[month + 1] = factor
      }
    } else {
      const monthlyRate = toMonthlyRate(baseRate)
      for (let month = 0; month < months; month += 1) {
        factor *= 1 + monthlyRate
        index[month + 1] = factor
      }
    }
    indexByType[type] = index
  })

  return indexByType
}

const resolveAssumptions = (context: InflationContext) =>
  context.assumptions ??
  context.scenario?.strategies.returnModel.inflationAssumptions ??
  context.snapshot?.scenario.strategies.returnModel.inflationAssumptions ??
  context.run?.snapshot?.scenario.strategies.returnModel.inflationAssumptions ??
  null

const resolveRateForYear = (
  year: number,
  inflationType: InflationType,
  context: InflationContext,
  fallbackRate: number,
) => {
  const { ratesByYear } = context
  if (!ratesByYear) {
    return fallbackRate
  }
  const entry =
    ratesByYear instanceof Map ? ratesByYear.get(year) : ratesByYear[year]
  if (entry === undefined || entry === null) {
    return fallbackRate
  }
  if (typeof entry === 'number') {
    return entry
  }
  return entry[inflationType] ?? fallbackRate
}

type ApplyInflationInput = InflationContext & {
  amount: number
  inflationType: InflationType
  fromDateIso?: string | null
  toDateIso?: string | null
}

export const applyInflation = ({
  amount,
  inflationType,
  fromDateIso,
  toDateIso,
  ...context
}: ApplyInflationInput) => {
  if (!Number.isFinite(amount) || amount === 0) {
    return amount
  }
  if (inflationType === 'none') {
    return amount
  }
  if (!fromDateIso || !toDateIso) {
    return amount
  }
  const fromDate = parseIsoDate(fromDateIso)
  const toDate = parseIsoDate(toDateIso)
  if (!fromDate || !toDate) {
    return amount
  }
  const sameDate = fromDate.getTime() === toDate.getTime()
  if (sameDate) {
    return amount
  }
  const indexByType = context.indexByType
  const indexStartDateIso = context.indexStartDateIso
  if (indexByType && indexStartDateIso) {
    const index = indexByType[inflationType]
    const indexStartDate = parseIsoDate(indexStartDateIso)
    if (index && indexStartDate) {
      if (fromDate >= indexStartDate && toDate >= indexStartDate) {
        const fromIndex = monthsBetween(indexStartDateIso, fromDateIso)
        const toIndex = monthsBetween(indexStartDateIso, toDateIso)
        if (
          fromIndex >= 0 &&
          toIndex >= 0 &&
          fromIndex < index.length &&
          toIndex < index.length
        ) {
          const factor = index[toIndex] / index[fromIndex]
          return amount * factor
        }
      }
    }
  }
  const forward = toDate.getTime() >= fromDate.getTime()
  const startIso = forward ? fromDateIso : toDateIso
  const endIso = forward ? toDateIso : fromDateIso
  const months = monthsBetween(startIso, endIso)
  if (months <= 0) {
    return amount
  }
  const assumptions = resolveAssumptions(context)
  const baseRate = assumptions ? (assumptions[inflationType] ?? 0) : 0
  if (!context.ratesByYear) {
    if (baseRate === 0) {
      return amount
    }
    const factor = Math.pow(1 + baseRate, months / 12)
    return forward ? amount * factor : amount / factor
  }
  let factor = 1
  const startDate = parseIsoDate(startIso)
  if (!startDate) {
    return amount
  }
  let cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()))
  for (let index = 0; index < months; index += 1) {
    const year = cursor.getUTCFullYear()
    const annualRate = resolveRateForYear(year, inflationType, context, baseRate)
    factor *= 1 + toMonthlyRate(annualRate)
    cursor = addMonthsUtc(cursor, 1)
  }
  return forward ? amount * factor : amount / factor
}
