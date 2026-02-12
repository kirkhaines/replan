import { z } from 'zod'
import { isoDateStringSchema, simulationSnapshotSchema } from '../models'
import {
  addYearsToIsoDateUtc,
  monthsBetweenIsoDates,
  parseIsoDateUtc,
} from '../utils/date'

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

  const expectedDeathDates = people.map((person) =>
    addYearsToIsoDateUtc(person.dateOfBirth, person.lifeExpectancy),
  )
  const endDate = expectedDeathDates.reduce((latest, candidate) => {
    const latestDate = parseIsoDateUtc(latest)
    const candidateDate = parseIsoDateUtc(candidate)
    if (!latestDate) {
      return candidate
    }
    if (!candidateDate) {
      return latest
    }
    return candidateDate > latestDate ? candidate : latest
  }, expectedDeathDates[0])
  const months = Math.max(1, monthsBetweenIsoDates(startDate, endDate))

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
