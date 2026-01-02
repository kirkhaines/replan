/// <reference lib="webworker" />
import { scenarioSchema } from '../core/models'
import { runSimulation } from '../core/sim/engine'
import type { RunScenarioRequest, RunScenarioResponse } from '../core/simClient/types'
import { createUuid } from '../core/utils/uuid'

const emptyResult = {
  timeline: [],
  summary: { endingBalance: 0, minBalance: 0, maxBalance: 0 },
}

const formatZodError = (message: string) => `Invalid scenario: ${message}`

self.onmessage = (event: MessageEvent<RunScenarioRequest>) => {
  const { scenario, requestId } = event.data
  const startedAt = Date.now()

  const parsed = scenarioSchema.safeParse(scenario)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const response: RunScenarioResponse = {
      type: 'runScenarioResult',
      requestId,
      run: {
        id: createUuid(),
        scenarioId: scenario.id ?? createUuid(),
        startedAt,
        finishedAt: Date.now(),
        status: 'error',
        errorMessage: formatZodError(issue?.message ?? 'Unknown error'),
        result: emptyResult,
      },
    }
    self.postMessage(response)
    return
  }

  const result = runSimulation(parsed.data)
  const response: RunScenarioResponse = {
    type: 'runScenarioResult',
    requestId,
    run: {
      id: createUuid(),
      scenarioId: parsed.data.id,
      startedAt,
      finishedAt: Date.now(),
      status: 'success',
      result,
    },
  }
  self.postMessage(response)
}
