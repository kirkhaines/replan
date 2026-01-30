import type { SimulationRun } from '../models'
import type { SimulationRequest } from '../sim/input'

export interface ISimClient {
  runScenario: (input: SimulationRequest) => Promise<SimulationRun>
  runScenarioBatch: (inputs: SimulationRequest[]) => Promise<SimulationRun[]>
}

export type RunScenarioRequest = {
  type: 'runScenario'
  requestId: string
  input: SimulationRequest
}

export type RunScenarioBatchRequest = {
  type: 'runScenarioBatch'
  requestId: string
  inputs: SimulationRequest[]
}

export type RunScenarioResponse = {
  type: 'runScenarioResult'
  requestId: string
  run: SimulationRun
}

export type RunScenarioBatchResponse = {
  type: 'runScenarioBatchResult'
  requestId: string
  runs: SimulationRun[]
}

export type SimWorkerMessage =
  | RunScenarioRequest
  | RunScenarioBatchRequest
  | RunScenarioResponse
  | RunScenarioBatchResponse
