import type { Scenario } from '../core/models'

type ScenarioOverrides = Partial<Scenario>

export const buildScenario = (overrides: ScenarioOverrides = {}): Scenario => {
  const now = Date.now()
  return {
    id: '00000000-0000-4000-8000-000000000000',
    name: 'Test Scenario',
    createdAt: now,
    updatedAt: now,
    personStrategyIds: ['00000000-0000-4000-8000-000000000001'],
    nonInvestmentAccountIds: ['00000000-0000-4000-8000-000000000002'],
    investmentAccountIds: ['00000000-0000-4000-8000-000000000003'],
    spendingStrategyId: '00000000-0000-4000-8000-000000000004',
    fundingStrategyType: 'pro_rata',
    ...overrides,
  }
}
