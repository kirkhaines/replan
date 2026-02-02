import { describe, expect, it } from 'vitest'
import { createSpendingModule } from './spendingModule'
import type { SimulationContext, SimulationSnapshot, SimulationState } from '../types'
import {
  contributionLimitDefaultsSeed,
  irmaaTableSeed,
  rmdTableSeed,
  ssaBendPointSeed,
  ssaRetirementAdjustmentSeed,
  ssaWageIndexSeed,
  socialSecurityProvisionalIncomeBracketsSeed,
  taxPolicySeed,
} from '../../defaults/defaultData'
import { buildScenario } from '../../../test/scenarioFactory'

const makeSnapshot = ({
  monthlyNeed,
  monthlyWant,
  scenarioOverrides,
}: {
  monthlyNeed: number
  monthlyWant: number
  scenarioOverrides?: {
    strategies?: Partial<SimulationSnapshot['scenario']['strategies']>
  }
}): SimulationSnapshot => {
  const baseScenario = buildScenario()
  const scenario = {
    ...baseScenario,
    strategies: {
      ...baseScenario.strategies,
      ...scenarioOverrides?.strategies,
    },
  }
  return {
    scenario,
    people: [
      {
        id: '00000000-0000-4000-8000-000000000010',
        name: 'Primary',
        dateOfBirth: '1980-01-01',
        lifeExpectancy: 90,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    personStrategies: [
      {
        id: scenario.personStrategyIds[0],
        scenarioId: scenario.id,
        personId: '00000000-0000-4000-8000-000000000010',
        futureWorkStrategyId: '00000000-0000-4000-8000-000000000020',
        socialSecurityStrategyId: '00000000-0000-4000-8000-000000000030',
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    socialSecurityStrategies: [
      {
        id: '00000000-0000-4000-8000-000000000030',
        personId: '00000000-0000-4000-8000-000000000010',
        startDate: '2050-01-01',
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    socialSecurityEarnings: [],
    futureWorkStrategies: [
      {
        id: '00000000-0000-4000-8000-000000000020',
        name: 'Work',
        personId: '00000000-0000-4000-8000-000000000010',
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    futureWorkPeriods: [],
    spendingStrategies: [
      {
        id: scenario.spendingStrategyId,
        name: 'Spending',
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    spendingLineItems: [
      {
        id: '00000000-0000-4000-8000-000000000040',
        name: 'Base spending',
        spendingStrategyId: scenario.spendingStrategyId,
        category: 'general',
        needAmount: monthlyNeed,
        wantAmount: monthlyWant,
        startDate: '',
        endDate: '',
        isPreTax: false,
        isCharitable: false,
        isWork: false,
        targetInvestmentAccountHoldingId: null,
        inflationType: 'none',
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    nonInvestmentAccounts: [
      {
        id: scenario.nonInvestmentAccountIds[0],
        name: 'Cash',
        balance: 0,
        interestRate: 0,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    investmentAccounts: [
      {
        id: scenario.investmentAccountIds[0],
        name: 'Invest',
        contributionEntries: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    investmentAccountHoldings: [],
    ssaWageIndex: ssaWageIndexSeed,
    ssaBendPoints: ssaBendPointSeed,
    ssaRetirementAdjustments: ssaRetirementAdjustmentSeed,
    contributionLimits: contributionLimitDefaultsSeed,
    taxPolicies: taxPolicySeed,
    socialSecurityProvisionalIncomeBrackets: socialSecurityProvisionalIncomeBracketsSeed,
    irmaaTables: irmaaTableSeed,
    rmdTable: rmdTableSeed,
  }
}

const makeState = (
  cashBalance: number,
  overrides: Partial<SimulationState> = {},
): SimulationState => ({
  cashAccounts: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      balance: cashBalance,
      interestRate: 0,
    },
  ],
  investmentAccounts: [
    {
      id: '00000000-0000-4000-8000-000000000003',
      contributionEntries: [],
    },
  ],
  holdings: [] as SimulationState['holdings'],
  yearLedger: {
    ordinaryIncome: 0,
    capitalGains: 0,
    deductions: 0,
    taxExemptIncome: 0,
    socialSecurityBenefits: 0,
    penalties: 0,
    taxPaid: 0,
    earnedIncome: 0,
  },
  pendingTaxDue: [],
  yearContributionsByTaxType: {
    cash: 0,
    taxable: 0,
    traditional: 0,
    roth: 0,
    hsa: 0,
  },
  magiHistory: {},
  initialBalance: cashBalance,
  guardrailTargetBalance: null,
  guardrailTargetDateIso: null,
  guardrailBaselineNeed: 0,
  guardrailBaselineWant: 0,
  guardrailGuytonMonthsRemaining: 0,
  guardrailFactorSum: 0,
  guardrailFactorMin: Number.POSITIVE_INFINITY,
  guardrailFactorCount: 0,
  guardrailFactorBelowCount: 0,
  ...overrides,
})

const makeContext = (snapshot: SimulationSnapshot): SimulationContext => {
  const dateIso = '2026-01-01'
  return {
    snapshot,
    settings: {
      startDate: dateIso,
      endDate: dateIso,
      months: 1,
      stepMonths: 1,
      summaryOnly: false,
    },
    monthIndex: 0,
    yearIndex: 0,
    age: 46,
    date: new Date(dateIso),
    dateIso,
    isStartOfYear: true,
    isEndOfYear: false,
    planMode: 'apply',
    summaryOnly: false,
  }
}

const sumCategory = (flows: { category: string; cash: number }[], category: string) =>
  flows
    .filter((flow) => flow.category === category)
    .reduce((sum, flow) => sum + Math.abs(flow.cash), 0)

describe('spendingModule guardrails', () => {
  it('caps wants based on withdrawal rate', () => {
    const snapshot = makeSnapshot({
      monthlyNeed: 1000,
      monthlyWant: 2000,
      scenarioOverrides: {
        strategies: {
          withdrawal: {
            guardrailStrategy: 'cap_wants',
            guardrailWithdrawalRateLimit: 0.04,
          },
        },
      },
    })
    const state = makeState(120000)
    const context = makeContext(snapshot)
    const module = createSpendingModule(snapshot)
    const cashflows = module.getCashflows?.(state, context) ?? []

    expect(sumCategory(cashflows, 'spending_need')).toBeCloseTo(1000, 6)
    expect(sumCategory(cashflows, 'spending_want')).toBeCloseTo(0, 6)
  })

  it('interpolates portfolio health factors', () => {
    const snapshot = makeSnapshot({
      monthlyNeed: 0,
      monthlyWant: 1000,
      scenarioOverrides: {
        strategies: {
          withdrawal: {
            guardrailStrategy: 'portfolio_health',
            guardrailHealthPoints: [
              { health: 1.05, factor: 1 },
              { health: 0.95, factor: 0.75 },
              { health: 0.85, factor: 0.5 },
              { health: 0.8, factor: 0 },
            ],
          },
        },
      },
    })
    const context = makeContext(snapshot)
    const state = makeState(90000, {
      guardrailTargetBalance: 100000,
      guardrailTargetDateIso: context.dateIso,
    })
    const module = createSpendingModule(snapshot)
    const cashflows = module.getCashflows?.(state, context) ?? []

    expect(sumCategory(cashflows, 'spending_want')).toBeCloseTo(625, 6)
  })

  it('applies Guyton guardrails when withdrawal rate spikes', () => {
    const snapshot = makeSnapshot({
      monthlyNeed: 1000,
      monthlyWant: 2000,
      scenarioOverrides: {
        strategies: {
          withdrawal: {
            guardrailStrategy: 'guyton',
            guardrailGuytonTriggerRateIncrease: 0.2,
            guardrailGuytonAppliedPct: 0.1,
            guardrailGuytonDurationMonths: 2,
          },
        },
      },
    })
    const context = makeContext(snapshot)
    const state = makeState(90000, {
      guardrailTargetBalance: 100000,
      guardrailTargetDateIso: context.dateIso,
      guardrailBaselineNeed: 1000,
      guardrailBaselineWant: 1000,
    })
    const module = createSpendingModule(snapshot)
    const cashflows = module.getCashflows?.(state, context) ?? []

    expect(sumCategory(cashflows, 'spending_need')).toBeCloseTo(1000, 6)
    expect(sumCategory(cashflows, 'spending_want')).toBeCloseTo(1800, 6)
    expect(state.guardrailGuytonMonthsRemaining).toBe(1)
  })
})
