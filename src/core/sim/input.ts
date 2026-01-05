import { z } from 'zod'
import { isoDateStringSchema, simulationSnapshotSchema } from '../models'

export const simulationRequestSchema = z.object({
  snapshot: simulationSnapshotSchema,
  startDate: isoDateStringSchema,
})

export type SimulationRequest = z.infer<typeof simulationRequestSchema>

export const simulationConfigSchema = z.object({
  snapshot: simulationSnapshotSchema,
  settings: z.object({
    startDate: isoDateStringSchema,
    endDate: isoDateStringSchema,
    months: z.number().int().min(1),
    stepMonths: z.number().int().min(1),
  }),
})

export type SimulationInput = z.infer<typeof simulationConfigSchema>

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10)

const addYears = (isoDate: string, years: number) => {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return isoDate
  }
  date.setFullYear(date.getFullYear() + years)
  return toIsoDate(date)
}

const monthsBetween = (startIso: string, endIso: string) => {
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0
  }
  let months = (end.getFullYear() - start.getFullYear()) * 12
  months += end.getMonth() - start.getMonth()
  if (end.getDate() < start.getDate()) {
    months -= 1
  }
  return Math.max(0, months)
}

export const buildSimulationInputFromRequest = (
  request: SimulationRequest,
): SimulationInput | null => {
  const { snapshot, startDate } = request
  const scenario = snapshot.scenario
  const activePersonStrategyIds = new Set(scenario.personStrategyIds)
  const activePersonIds = new Set(
    snapshot.personStrategies
      .filter((strategy) => activePersonStrategyIds.has(strategy.id))
      .map((strategy) => strategy.personId),
  )

  const people = snapshot.people.filter((person) => activePersonIds.has(person.id))
  if (people.length === 0) {
    return null
  }

  const oldestPerson = people.reduce(
    (current, person) =>
      person.lifeExpectancy > current.lifeExpectancy ? person : current,
    people[0],
  )
  const endDate = addYears(oldestPerson.dateOfBirth, oldestPerson.lifeExpectancy)
  const months = Math.max(1, monthsBetween(startDate, endDate))

  return {
    snapshot,
    settings: {
      startDate,
      endDate,
      months,
      stepMonths: 1,
    },
  }
}
