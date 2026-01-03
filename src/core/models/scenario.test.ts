import { describe, expect, it } from 'vitest'
import { scenarioSchema } from './scenario'
import { buildScenario } from '../../test/scenarioFactory'

describe('scenarioSchema', () => {
  it('requires at least one person strategy id', () => {
    const scenario = buildScenario({
      personStrategyIds: [],
    })

    const result = scenarioSchema.safeParse(scenario)
    expect(result.success).toBe(false)
  })
})
