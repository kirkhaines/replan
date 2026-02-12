const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/

export type IsoDateParts = {
  year: number
  month: number
  day: number
}

const getDaysInMonthUtc = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate()

export const parseIsoDateParts = (value?: string | null): IsoDateParts | null => {
  if (!value) {
    return null
  }
  const normalized = value.trim().slice(0, 10)
  const match = normalized.match(isoDatePattern)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }
  if (month < 1 || month > 12) {
    return null
  }
  const daysInMonth = getDaysInMonthUtc(year, month)
  if (day < 1 || day > daysInMonth) {
    return null
  }
  return { year, month, day }
}

export const parseIsoDateUtc = (value?: string | null) => {
  const parts = parseIsoDateParts(value)
  if (!parts) {
    return null
  }
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

export const toIsoDateUtc = (value: Date) => value.toISOString().slice(0, 10)

export const getYearFromIsoDate = (value?: string | null) => {
  const parts = parseIsoDateParts(value)
  return parts ? parts.year : null
}

export const getMonthFromIsoDate = (value?: string | null) => {
  const parts = parseIsoDateParts(value)
  return parts ? parts.month : null
}

export const addMonthsUtc = (date: Date, months: number) => {
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

export const addMonthsToIsoDateUtc = (isoDate: string, months: number) => {
  const date = parseIsoDateUtc(isoDate)
  if (!date) {
    return isoDate
  }
  return toIsoDateUtc(addMonthsUtc(date, months))
}

export const addYearsToIsoDateUtc = (isoDate: string, years: number) =>
  addMonthsToIsoDateUtc(isoDate, years * 12)

export const monthsBetweenIsoDates = (startIso: string, endIso: string) => {
  const start = parseIsoDateParts(startIso)
  const end = parseIsoDateParts(endIso)
  if (!start || !end) {
    return 0
  }
  let months = (end.year - start.year) * 12
  months += end.month - start.month
  if (end.day < start.day) {
    months -= 1
  }
  return Math.max(0, months)
}

export const isSameMonthIsoDates = (leftIso: string, rightIso: string) => {
  const left = parseIsoDateParts(leftIso)
  const right = parseIsoDateParts(rightIso)
  if (!left || !right) {
    return false
  }
  return left.year === right.year && left.month === right.month
}

export const compareIsoDates = (leftIso: string, rightIso: string) => {
  const left = parseIsoDateParts(leftIso)
  const right = parseIsoDateParts(rightIso)
  if (!left || !right) {
    return left ? 1 : right ? -1 : 0
  }
  if (left.year !== right.year) {
    return left.year - right.year
  }
  if (left.month !== right.month) {
    return left.month - right.month
  }
  return left.day - right.day
}

export const getAgeInMonthsAtIsoDate = (dateOfBirth: string, dateValue: string) => {
  const birth = parseIsoDateParts(dateOfBirth)
  const target = parseIsoDateParts(dateValue)
  if (!birth || !target) {
    return 0
  }
  let months = (target.year - birth.year) * 12 + (target.month - birth.month)
  if (target.day < birth.day) {
    months -= 1
  }
  return Math.max(0, months)
}

export const getAgeInYearsAtIsoDate = (dateOfBirth: string, dateValue: string) =>
  Math.max(0, Math.round((getAgeInMonthsAtIsoDate(dateOfBirth, dateValue) / 12) * 10) / 10)
