import type { SimulationRun } from '../models'
import type { SimulationRequest } from '../sim/input'

export interface ISimClient {
  runScenario: (input: SimulationRequest) => Promise<SimulationRun>
  runScenarioBatch: (input: RunScenarioBatchInput) => Promise<SimulationRun[]>
}

export type RunScenarioBatchInput = {
  snapshot: SimulationRequest['snapshot']
  startDate: SimulationRequest['startDate']
  seeds: number[]
}

export type RunScenarioRequest = {
  type: 'runScenario'
  requestId: string
  input: SimulationRequest
  workerId?: number
}

export type RunScenarioBatchRequest = {
  type: 'runScenarioBatch'
  requestId: string
  snapshot: SimulationRequest['snapshot']
  startDate: SimulationRequest['startDate']
  seeds: number[]
  workerId?: number
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
