import type { Scenario, SimulationRun, SimulationSnapshot } from '../models'
import { inflationTypeSchema } from '../models/enums'

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

export const parseIsoDate = (value?: string | null) => {
  if (!value) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

export const monthsBetween = (startIso: string, endIso: string) => {
  const start = parseIsoDate(startIso)
  const end = parseIsoDate(endIso)
  if (!start || !end) {
    return 0
  }
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
  months += end.getUTCMonth() - start.getUTCMonth()
  if (end.getUTCDate() < start.getUTCDate()) {
    months -= 1
  }
  return Math.max(0, months)
}

export const toMonthlyRate = (annualRate: number) => Math.pow(1 + annualRate, 1 / 12) - 1

const addMonthsUtc = (date: Date, months: number) => {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const targetMonthIndex = month + months
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const clampedDay = Math.min(day, daysInTargetMonth)
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay))
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
  rateOverride?: number
}

export const applyInflation = ({
  amount,
  inflationType,
  fromDateIso,
  toDateIso,
  rateOverride,
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
  const baseRate =
    rateOverride ?? (assumptions ? (assumptions[inflationType] ?? 0) : 0)
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
