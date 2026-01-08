import type { Scenario } from '../core/models'
import { createDefaultScenarioStrategies } from '../core/models'
import { inflationDefaultsSeed } from '../core/defaults/defaultData'

type ScenarioOverrides = Partial<Scenario>

export const buildScenario = (overrides: ScenarioOverrides = {}): Scenario => {
  const now = Date.now()
  const baseStrategies = createDefaultScenarioStrategies()
  return {
    id: '00000000-0000-4000-8000-000000000000',
    name: 'Test Scenario',
    description: '',
    createdAt: now,
    updatedAt: now,
    personStrategyIds: ['00000000-0000-4000-8000-000000000001'],
    nonInvestmentAccountIds: ['00000000-0000-4000-8000-000000000002'],
    investmentAccountIds: ['00000000-0000-4000-8000-000000000003'],
    spendingStrategyId: '00000000-0000-4000-8000-000000000004',
    strategies: {
      ...baseStrategies,
      returnModel: {
        ...baseStrategies.returnModel,
        inflationAssumptions: inflationDefaultsSeed.reduce<
          Scenario['strategies']['returnModel']['inflationAssumptions']
        >(
          (acc, seed) => ({ ...acc, [seed.type]: seed.rate }),
          {} as Scenario['strategies']['returnModel']['inflationAssumptions'],
        ),
      },
    },
    ...overrides,
  }
}
