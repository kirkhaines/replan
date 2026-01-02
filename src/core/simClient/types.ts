import type { Scenario, SimulationRun } from '../models'

export interface ISimClient {
  runScenario: (scenario: Scenario) => Promise<SimulationRun>
}

export type RunScenarioRequest = {
  type: 'runScenario'
  requestId: string
  scenario: Scenario
}

export type RunScenarioResponse = {
  type: 'runScenarioResult'
  requestId: string
  run: SimulationRun
}

export type SimWorkerMessage = RunScenarioRequest | RunScenarioResponse
