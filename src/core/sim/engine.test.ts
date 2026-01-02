import { describe, expect, it } from 'vitest'
import { runSimulation } from './engine'
import { buildScenario } from '../../test/scenarioFactory'

describe('runSimulation', () => {
  it('produces deterministic balances', () => {
    const scenario = buildScenario({
      finances: {
        startingBalance: 100,
        annualContribution: 10,
        annualSpending: 5,
      },
      assumptions: {
        annualReturn: 0,
        annualInflation: 0,
        years: 2,
      },
    })

    const result = runSimulation(scenario)

    expect(result.timeline).toHaveLength(2)
    expect(result.summary.endingBalance).toBe(110)
    expect(result.summary.minBalance).toBe(100)
    expect(result.summary.maxBalance).toBe(110)
  })
})
