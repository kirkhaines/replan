import { db } from '../../db/db'
import type { Scenario, SimulationRun } from '../models'
import type { RunRepo, ScenarioRepo, StorageClient } from './types'

class DexieScenarioRepo implements ScenarioRepo {
  async list() {
    return db.scenarios.orderBy('updatedAt').reverse().toArray()
  }

  async get(id: string) {
    return db.scenarios.get(id)
  }

  async upsert(scenario: Scenario) {
    await db.scenarios.put(scenario)
  }

  async remove(id: string) {
    await db.scenarios.delete(id)
  }
}

class DexieRunRepo implements RunRepo {
  async listForScenario(scenarioId: string) {
    const runs = await db.runs
      .where('scenarioId')
      .equals(scenarioId)
      .sortBy('finishedAt')
    return runs.reverse()
  }

  async add(run: SimulationRun) {
    await db.runs.add(run)
  }

  async get(id: string) {
    return db.runs.get(id)
  }
}

export const createDexieStorageClient = (): StorageClient => ({
  scenarioRepo: new DexieScenarioRepo(),
  runRepo: new DexieRunRepo(),
})
