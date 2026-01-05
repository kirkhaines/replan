/// <reference lib="webworker" />
import { runSimulation } from '../core/sim/engine'
import {
  buildSimulationInputFromRequest,
  simulationRequestSchema,
} from '../core/sim/input'
import type { RunScenarioRequest, RunScenarioResponse } from '../core/simClient/types'
import { createUuid } from '../core/utils/uuid'

const emptyResult = {
  timeline: [],
  summary: { endingBalance: 0, minBalance: 0, maxBalance: 0 },
}

const formatZodError = (message: string) => `Invalid scenario: ${message}`

self.onmessage = (event: MessageEvent<RunScenarioRequest>) => {
  const { input, requestId } = event.data
  const startedAt = Date.now()

  const parsed = simulationRequestSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const response: RunScenarioResponse = {
      type: 'runScenarioResult',
      requestId,
      run: {
        id: createUuid(),
        scenarioId: input?.snapshot?.scenario?.id ?? createUuid(),
        startedAt,
        finishedAt: Date.now(),
        status: 'error',
        errorMessage: formatZodError(issue?.message ?? 'Unknown error'),
        result: emptyResult,
        snapshot: input?.snapshot,
      },
    }
    self.postMessage(response)
    return
  }

  const simulationInput = buildSimulationInputFromRequest(parsed.data)
  if (!simulationInput) {
    const response: RunScenarioResponse = {
      type: 'runScenarioResult',
      requestId,
      run: {
        id: createUuid(),
        scenarioId: parsed.data.snapshot.scenario.id,
        startedAt,
        finishedAt: Date.now(),
        status: 'error',
        errorMessage: 'Scenario snapshot is missing required data.',
        result: emptyResult,
        snapshot: parsed.data.snapshot,
      },
    }
    self.postMessage(response)
    return
  }

  const result = runSimulation(simulationInput)
  const response: RunScenarioResponse = {
    type: 'runScenarioResult',
    requestId,
    run: {
      id: createUuid(),
      scenarioId: parsed.data.snapshot.scenario.id,
      startedAt,
      finishedAt: Date.now(),
      status: 'success',
      result,
      snapshot: parsed.data.snapshot,
    },
  }
  self.postMessage(response)
}
