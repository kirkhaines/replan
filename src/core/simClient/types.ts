import type { SimulationRun } from '../models'
import type { SimulationRequest } from '../sim/input'

export interface ISimClient {
  runScenario: (input: SimulationRequest) => Promise<SimulationRun>
}

export type RunScenarioRequest = {
  type: 'runScenario'
  requestId: string
  input: SimulationRequest
}

export type RunScenarioResponse = {
  type: 'runScenarioResult'
  requestId: string
  run: SimulationRun
}

export type SimWorkerMessage = RunScenarioRequest | RunScenarioResponse
