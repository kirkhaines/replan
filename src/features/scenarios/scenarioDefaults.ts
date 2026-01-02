import type { Scenario } from '../../core/models'
import { createUuid } from '../../core/utils/uuid'

export const createDefaultScenario = (): Scenario => {
  const now = Date.now()

  return {
    id: createUuid(),
    name: 'New Scenario',
    createdAt: now,
    updatedAt: now,
    person: {
      currentAge: 35,
      retirementAge: 65,
    },
    finances: {
      startingBalance: 100000,
      annualContribution: 10000,
      annualSpending: 30000,
    },
    assumptions: {
      annualReturn: 0.05,
      annualInflation: 0.02,
      years: 30,
    },
  }
}
