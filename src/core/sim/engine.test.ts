import { describe, expect, it } from 'vitest'
import { runSimulation } from './engine'
import type { SimulationInput } from './input'

describe('runSimulation', () => {
  it('produces deterministic balances', () => {
    const input: SimulationInput = {
      scenarioId: '00000000-0000-4000-8000-000000000000',
      currentAge: 30,
      years: 2,
      startingBalance: 100,
      annualContribution: 10,
      annualSpending: 5,
      annualReturn: 0,
      annualInflation: 0,
    }

    const result = runSimulation(input)

    expect(result.timeline).toHaveLength(2)
    expect(result.summary.endingBalance).toBe(110)
    expect(result.summary.minBalance).toBe(100)
    expect(result.summary.maxBalance).toBe(110)
  })
})
