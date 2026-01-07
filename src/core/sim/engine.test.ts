import { describe, expect, it, vi } from 'vitest'
import { runSimulation } from './engine'
import { buildSimulationInputFromRequest, simulationRequestSchema } from './input'
import type { SimulationInput } from './input'
import { createDefaultScenarioStrategies } from '../models'
import { createDefaultScenarioBundle } from '../../features/scenarios/scenarioDefaults'
import {
  irmaaTableSeed,
  rmdTableSeed,
  contributionLimitDefaultsSeed,
  ssaBendPointSeed,
  ssaRetirementAdjustmentSeed,
  ssaWageIndexSeed,
  taxPolicySeed,
} from '../defaults/defaultData'
import { createUuid } from '../utils/uuid'

describe('runSimulation', () => {
  it('produces deterministic balances', () => {
    const baseStrategies = createDefaultScenarioStrategies()
    const request = {
      startDate: '2020-01-01',
      snapshot: {
        scenario: {
          id: '00000000-0000-4000-8000-000000000000',
          name: 'Test',
          createdAt: 0,
          updatedAt: 0,
          personStrategyIds: ['00000000-0000-4000-8000-000000000001'],
          nonInvestmentAccountIds: ['00000000-0000-4000-8000-000000000002'],
          investmentAccountIds: ['00000000-0000-4000-8000-000000000003'],
          spendingStrategyId: '00000000-0000-4000-8000-000000000004',
          strategies: {
            ...baseStrategies,
            returnModel: {
              ...baseStrategies.returnModel,
              inflationAssumptions: {
                none: 0,
                cpi: 0,
                medical: 0,
                housing: 0,
                education: 0,
              },
            },
          },
        },
        people: [
          {
            id: '00000000-0000-4000-8000-000000000010',
            name: 'Primary',
            dateOfBirth: '1990-01-01',
            lifeExpectancy: 31,
            createdAt: 0,
            updatedAt: 0,
          },
        ],
        personStrategies: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            scenarioId: '00000000-0000-4000-8000-000000000000',
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
            startDate: '2057-01-01',
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
            id: '00000000-0000-4000-8000-000000000004',
            name: 'Spending',
            createdAt: 0,
            updatedAt: 0,
          },
        ],
        spendingLineItems: [],
        nonInvestmentAccounts: [
          {
            id: '00000000-0000-4000-8000-000000000002',
            name: 'Cash',
            balance: 100,
            interestRate: 0,
            createdAt: 0,
            updatedAt: 0,
          },
        ],
        investmentAccounts: [
          {
            id: '00000000-0000-4000-8000-000000000003',
            name: 'Invest',
            createdAt: 0,
            updatedAt: 0,
          },
        ],
        investmentAccountHoldings: [
          {
            id: '00000000-0000-4000-8000-000000000050',
            investmentAccountId: '00000000-0000-4000-8000-000000000003',
            name: 'Index',
            taxType: 'taxable',
            balance: 200,
            contributionBasis: 200,
            holdingType: 'sp500',
            returnRate: 0,
            returnStdDev: 0,
            createdAt: 0,
            updatedAt: 0,
          },
        ],
        ssaWageIndex: [],
        ssaBendPoints: [],
        ssaRetirementAdjustments: [],
        contributionLimits: [],
        taxPolicies: [],
        irmaaTables: [],
        rmdTable: [],
      },
    }
    const input = buildSimulationInputFromRequest(request)
    if (!input) {
      throw new Error('Expected valid input')
    }

    const result = runSimulation(input as SimulationInput)

    expect(result.timeline).toHaveLength(1)
    expect(result.summary.endingBalance).toBe(300)
    expect(result.summary.minBalance).toBe(300)
    expect(result.summary.maxBalance).toBe(300)
    expect(result.monthlyTimeline).toHaveLength(12)
    expect(result.explanations).toHaveLength(12)
    expect(result.explanations?.[0]?.modules.length ?? 0).toBeGreaterThan(0)
  })

  it('runs with freshly created default scenario data', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    try {
      const bundle = createDefaultScenarioBundle()
      const timestamp = Date.now()
      const snapshot = {
        scenario: bundle.scenario,
        people: [bundle.person],
        personStrategies: [bundle.personStrategy],
        socialSecurityStrategies: [bundle.socialSecurityStrategy],
        socialSecurityEarnings: bundle.socialSecurityEarnings,
        futureWorkStrategies: [bundle.futureWorkStrategy],
        futureWorkPeriods: [bundle.futureWorkPeriod],
        spendingStrategies: [bundle.spendingStrategy],
        spendingLineItems: [bundle.spendingLineItem],
        nonInvestmentAccounts: [bundle.nonInvestmentAccount],
        investmentAccounts: [bundle.investmentAccount],
        investmentAccountHoldings: [bundle.investmentAccountHolding],
        ssaWageIndex: ssaWageIndexSeed.map((seed) => ({
          id: createUuid(),
          year: seed.year,
          index: seed.index,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
        ssaBendPoints: ssaBendPointSeed.map((seed) => ({
          id: createUuid(),
          year: seed.year,
          first: seed.first,
          second: seed.second,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
        ssaRetirementAdjustments: ssaRetirementAdjustmentSeed.map((seed) => ({
          id: createUuid(),
          birthYearStart: seed.birthYearStart,
          birthYearEnd: seed.birthYearEnd,
          normalRetirementAgeMonths: seed.normalRetirementAgeMonths,
          delayedRetirementCreditPerYear: seed.delayedRetirementCreditPerYear,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
        contributionLimits: contributionLimitDefaultsSeed.map((seed) => ({
          id: createUuid(),
          type: seed.type,
          year: seed.year,
          amount: seed.amount,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
        taxPolicies: taxPolicySeed,
        irmaaTables: irmaaTableSeed,
        rmdTable: rmdTableSeed,
      }

      const request = {
        startDate: '2024-01-01',
        snapshot,
      }

      const parsed = simulationRequestSchema.safeParse(request)
      if (!parsed.success) {
        const details = parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ')
        throw new Error(details)
      }

      const input = buildSimulationInputFromRequest(parsed.data)
      expect(input).not.toBeNull()
      if (!input) {
        throw new Error('Expected valid input')
      }

      const result = runSimulation(input as SimulationInput)
      expect(result.timeline.length).toBeGreaterThan(0)
      expect(result.monthlyTimeline?.length ?? 0).toBeGreaterThan(0)
      expect(result.explanations?.length ?? 0).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
