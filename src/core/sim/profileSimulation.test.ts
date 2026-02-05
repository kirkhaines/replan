import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import type { LocalScenarioSeed } from '../defaults/localSeedTypes'
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
import { runSimulation } from './engine'
import { buildSimulationInputFromRequest, type SimulationRequest } from './input'

const profileEnabled = process.env.REPLAN_PROFILE === '1'
const profileRuns = Number(process.env.REPLAN_PROFILE_RUNS ?? 0)
const profileTimeout = Number(process.env.REPLAN_PROFILE_TIMEOUT_MS ?? 300000)

const runIfEnabled = profileEnabled ? it : it.skip

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

const loadLocalSeed = (): LocalScenarioSeed => {
  const path = resolve(process.cwd(), 'src/core/defaults/localSeed.json')
  return JSON.parse(readFileSync(path, 'utf8')) as LocalScenarioSeed
}

const buildStochasticRequest = (
  snapshot: SimulationSnapshot,
  startDate: string,
  seed: number,
): SimulationRequest => {
  const returnModel = snapshot.scenario.strategies.returnModel
  return {
    snapshot: {
      ...snapshot,
      scenario: {
        ...snapshot.scenario,
        strategies: {
          ...snapshot.scenario.strategies,
          returnModel: {
            ...returnModel,
            mode: 'stochastic',
            seed,
            stochasticRuns: 0,
          },
        },
      },
    },
    startDate,
  }
}

describe('profile simulation', () => {
  runIfEnabled(
    'local seed scenario timing',
    { timeout: Number.isFinite(profileTimeout) ? profileTimeout : 300000 },
    () => {
      const seed = loadLocalSeed()
      const snapshot = buildSnapshot(seed)
      const startDate = '2026-01-01'
      const request: SimulationRequest = { snapshot, startDate }
      const input = buildSimulationInputFromRequest(request)
      expect(input).not.toBeNull()
      if (!input) {
        return
      }

      const deterministicStart = performance.now()
      const full = runSimulation(input)
      const deterministicEnd = performance.now()

      const targetRuns = snapshot.scenario.strategies.returnModel.stochasticRuns ?? 0
      const resolvedRuns = Number.isFinite(profileRuns) && profileRuns > 0 ? profileRuns : 50
      const runCount = Math.min(
        Math.max(0, resolvedRuns),
        targetRuns > 0 ? targetRuns : resolvedRuns,
      )

      const stochasticStart = performance.now()
      for (let index = 0; index < runCount; index += 1) {
        const seedValue = index + 1
        const stochasticRequest = buildStochasticRequest(snapshot, startDate, seedValue)
        const stochasticInput = buildSimulationInputFromRequest(stochasticRequest)
        if (!stochasticInput) {
          continue
        }
        runSimulation(stochasticInput, { summaryOnly: true })
      }
      const stochasticEnd = performance.now()

      const deterministicMs = deterministicEnd - deterministicStart
      const stochasticMs = stochasticEnd - stochasticStart
      const perRunMs = runCount > 0 ? stochasticMs / runCount : 0
      console.info('[Profile] Deterministic run (ms):', deterministicMs.toFixed(2))
      console.info('[Profile] Stochastic runs:', runCount, 'total ms:', stochasticMs.toFixed(2))
      console.info('[Profile] Stochastic per-run ms:', perRunMs.toFixed(2))
      console.info('[Profile] Stochastic target:', targetRuns)
      expect(full.summary.endingBalance).toBeTypeOf('number')
    },
  )
})
