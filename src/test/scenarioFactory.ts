import type { Scenario } from '../core/models'

type ScenarioOverrides = Partial<Scenario> & {
  person?: Partial<Scenario['person']>
  finances?: Partial<Scenario['finances']>
  assumptions?: Partial<Scenario['assumptions']>
}

export const buildScenario = (overrides: ScenarioOverrides = {}): Scenario => {
  const now = Date.now()
  return {
    id: '00000000-0000-4000-8000-000000000000',
    name: 'Test Scenario',
    createdAt: now,
    updatedAt: now,
    person: {
      currentAge: 30,
      retirementAge: 65,
      ...overrides.person,
    },
    finances: {
      startingBalance: 100,
      annualContribution: 10,
      annualSpending: 5,
      ...overrides.finances,
    },
    assumptions: {
      annualReturn: 0,
      annualInflation: 0,
      years: 2,
      ...overrides.assumptions,
    },
    ...overrides,
  }
}
