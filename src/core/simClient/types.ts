import type { SimulationRun } from '../models'
import type { SimulationInput } from '../sim/input'

export interface ISimClient {
  runScenario: (input: SimulationInput) => Promise<SimulationRun>
}

export type RunScenarioRequest = {
  type: 'runScenario'
  requestId: string
  input: SimulationInput
}

export type RunScenarioResponse = {
  type: 'runScenarioResult'
  requestId: string
  run: SimulationRun
}

export type SimWorkerMessage = RunScenarioRequest | RunScenarioResponse
