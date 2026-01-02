import { describe, expect, it } from 'vitest'
import { scenarioSchema } from './scenario'
import { buildScenario } from '../../test/scenarioFactory'

describe('scenarioSchema', () => {
  it('rejects retirement age that is not greater than current age', () => {
    const scenario = buildScenario({
      person: {
        currentAge: 60,
        retirementAge: 55,
      },
    })

    const result = scenarioSchema.safeParse(scenario)
    expect(result.success).toBe(false)
  })
})
