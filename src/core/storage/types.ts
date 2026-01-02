import type { Scenario, SimulationRun } from '../models'

export interface ScenarioRepo {
  list: () => Promise<Scenario[]>
  get: (id: string) => Promise<Scenario | undefined>
  upsert: (scenario: Scenario) => Promise<void>
  remove: (id: string) => Promise<void>
}

export interface RunRepo {
  listForScenario: (scenarioId: string) => Promise<SimulationRun[]>
  add: (run: SimulationRun) => Promise<void>
  get: (id: string) => Promise<SimulationRun | undefined>
}

export interface StorageClient {
  scenarioRepo: ScenarioRepo
  runRepo: RunRepo
}
