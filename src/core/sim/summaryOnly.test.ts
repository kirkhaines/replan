import { describe, expect, it } from 'vitest'
import { runSimulation } from './engine'
import { buildSimulationInputFromRequest } from './input'
import { demoScenarios } from '../defaults/demo'
import {
  contributionLimitDefaultsSeed,
  inflationDefaultsSeed,
  irmaaTableSeed,
  rmdTableSeed,
  ssaBendPointSeed,
  ssaRetirementAdjustmentSeed,
  ssaWageIndexSeed,
  socialSecurityProvisionalIncomeBracketsSeed,
  taxPolicySeed,
} from '../defaults/defaultData'
import {
  inflationTypeSchema,
  normalizeScenarioStrategies,
  type FutureWorkPeriod,
  type SimulationSnapshot,
  type SpendingLineItem,
} from '../models'
import type { LocalScenarioSeed } from '../defaults/localSeedTypes'

const buildInflationMap = (
  defaults: Array<{ type: string; rate: number }>,
  current?: Record<string, number>,
) => {
  const fallback = defaults.length > 0 ? defaults : inflationDefaultsSeed
  return Object.fromEntries(
    inflationTypeSchema.options.map((type) => [
      type,
      current?.[type] ?? fallback.find((item) => item.type === type)?.rate ?? 0,
    ]),
  ) as Record<(typeof inflationTypeSchema.options)[number], number>
}

const normalizeSpendingLineItem = (item: SpendingLineItem): SpendingLineItem => ({
  ...item,
  inflationType: item.inflationType ?? 'cpi',
  targetInvestmentAccountHoldingId: item.targetInvestmentAccountHoldingId ?? null,
})

const toIsoDateString = (value?: string | null) => {
  if (!value) {
    return null
  }
  const matches = /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (!matches) {
    return null
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return value
}

const normalizeFutureWorkPeriod = (base: FutureWorkPeriod): FutureWorkPeriod => {
  const contributionType = base['401kContributionType']
  const employeeHoldingId = base['401kInvestmentAccountHoldingId']
  const employerHoldingId = base['401kEmployerMatchHoldingId']
  const hsaHoldingId = base['hsaInvestmentAccountHoldingId']
  return {
    ...base,
    startDate: toIsoDateString(base.startDate),
    endDate: toIsoDateString(base.endDate),
    '401kContributionType': contributionType ? contributionType : 'fixed',
    '401kContributionAnnual': base['401kContributionAnnual'] ?? 0,
    '401kContributionPct': base['401kContributionPct'] ?? 0,
    '401kMatchPctCap': base['401kMatchPctCap'] ?? 0,
    '401kMatchRatio': base['401kMatchRatio'] ?? 0,
    '401kInvestmentAccountHoldingId': employeeHoldingId,
    '401kEmployerMatchHoldingId': employerHoldingId ? employerHoldingId : employeeHoldingId,
    'hsaContributionAnnual': base['hsaContributionAnnual'] ?? 0,
    'hsaEmployerContributionAnnual': base['hsaEmployerContributionAnnual'] ?? 0,
    'hsaUseMaxLimit': base['hsaUseMaxLimit'] ?? false,
    'hsaInvestmentAccountHoldingId': hsaHoldingId ? hsaHoldingId : null,
  }
}

const buildSnapshot = (seed: LocalScenarioSeed): SimulationSnapshot => {
  const inflationAssumptions = buildInflationMap(
    inflationDefaultsSeed,
    seed.scenario.strategies.returnModel.inflationAssumptions,
  )
  const normalizedScenario = {
    ...seed.scenario,
    strategies: normalizeScenarioStrategies({
      ...seed.scenario.strategies,
      returnModel: {
        ...seed.scenario.strategies.returnModel,
        mode: 'deterministic',
        stochasticRuns: 0,
        inflationAssumptions,
      },
      events: seed.scenario.strategies.events.map((event) => ({
        ...event,
        inflationType: event.inflationType ?? 'none',
      })),
    }),
  }

  return {
    scenario: normalizedScenario,
    people: seed.people,
    personStrategies: seed.personStrategies,
    socialSecurityStrategies: seed.socialSecurityStrategies,
    socialSecurityEarnings: seed.socialSecurityEarnings,
    futureWorkStrategies: seed.futureWorkStrategies,
    futureWorkPeriods: seed.futureWorkPeriods.map(normalizeFutureWorkPeriod),
    spendingStrategies: seed.spendingStrategies,
    spendingLineItems: seed.spendingLineItems.map(normalizeSpendingLineItem),
    nonInvestmentAccounts: seed.nonInvestmentAccounts,
    investmentAccounts: seed.investmentAccounts,
    investmentAccountHoldings: seed.investmentAccountHoldings,
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

describe('summary-only simulation', () => {
  demoScenarios.forEach((demo) => {
    it(`matches summary for ${demo.label}`, () => {
      const snapshot = buildSnapshot(demo.seed)
      const request = {
        startDate: '2026-01-01',
        snapshot,
      }
      const input = buildSimulationInputFromRequest(request)
      expect(input).not.toBeNull()
      const full = runSimulation(input as NonNullable<typeof input>)
      const summaryOnly = runSimulation(input as NonNullable<typeof input>, {
        summaryOnly: true,
      })
      expect(summaryOnly.summary).toEqual(full.summary)
    })
  })
})
