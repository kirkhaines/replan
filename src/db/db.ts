import Dexie, { type Table } from 'dexie'
import type { Scenario, SimulationRun } from '../core/models'

class ReplanDb extends Dexie {
  scenarios!: Table<Scenario, string>
  runs!: Table<SimulationRun, string>

  constructor() {
    super('replan')
    this.version(1).stores({
      scenarios: 'id, updatedAt',
      runs: 'id, scenarioId, finishedAt',
    })
  }
}

export const db = new ReplanDb()
