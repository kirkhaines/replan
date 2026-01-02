import type { ISimClient, RunScenarioResponse } from './types'
import type { Scenario, SimulationRun } from '../models'
import { createUuid } from '../utils/uuid'

export const createWorkerSimClient = (): ISimClient => {
  const worker = new Worker(
    new URL('../../workers/simulationWorker.ts', import.meta.url),
    { type: 'module' },
  )
  const pending = new Map<string, (run: SimulationRun) => void>()

  worker.onmessage = (event) => {
    const message = event.data as RunScenarioResponse
    if (message.type !== 'runScenarioResult') {
      return
    }

    const resolve = pending.get(message.requestId)
    if (resolve) {
      pending.delete(message.requestId)
      resolve(message.run)
    }
  }

  const runScenario = (scenario: Scenario) =>
    new Promise<SimulationRun>((resolve) => {
      const requestId = createUuid()
      pending.set(requestId, resolve)
      worker.postMessage({ type: 'runScenario', requestId, scenario })
    })

  return { runScenario }
}
