import { describe, expect, it } from 'vitest'
import { createSepp72tModule } from './sepp72tModule'
import type { SimulationContext, SimulationState } from '../types'
import type { InvestmentAccountHolding, SimulationSnapshot } from '../../models'
import { createDefaultScenarioStrategies } from '../../models'

const makeHolding = (
  id: string,
  taxType: 'traditional' | 'roth' | 'taxable',
  balance: number,
): InvestmentAccountHolding => ({
  id,
  investmentAccountId: 'acc-1',
  name: `Holding ${id}`,
  holdingType: 'sp500',
  taxType,
  balance,
  returnRate: 0.05,
  returnStdDev: 0.1,
  costBasisEntries: [],
  createdAt: 0,
  updatedAt: 0,
})

const makeContext = (
  snapshot: SimulationSnapshot,
  age: number,
  isStartOfYear = true,
): SimulationContext => ({
  snapshot,
  settings: {
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    months: 120,
    stepMonths: 1,
    summaryOnly: false,
  },
  monthIndex: 0,
  yearIndex: 0,
  age,
  date: new Date('2026-01-01T00:00:00Z'),
  dateIso: '2026-01-01',
  isStartOfYear,
  isEndOfYear: false,
  planMode: 'apply',
  summaryOnly: false,
})

const makeSnapshot = (
  seppOverrides?: Partial<ReturnType<typeof createDefaultScenarioStrategies>['sepp72t']>,
): SimulationSnapshot => {
  const defaultStrategies = createDefaultScenarioStrategies()
  return {
    scenario: {
      id: 'sc-1',
      name: 'Test Scenario',
      personStrategyIds: ['ps-1'],
      nonInvestmentAccountIds: ['cash-1'],
      investmentAccountIds: ['acc-1'],
      spendingStrategyId: 'sp-1',
      strategies: {
        ...defaultStrategies,
        sepp72t: {
          ...defaultStrategies.sepp72t,
          enabled: true,
          startAge: 50,
          annualDistribution: 20000,
          ...seppOverrides,
        },
      },
      createdAt: 0,
      updatedAt: 0,
    },
    people: [],
    personStrategies: [],
    socialSecurityStrategies: [],
    socialSecurityEarnings: [],
    futureWorkStrategies: [],
    futureWorkPeriods: [],
    spendingStrategies: [],
    spendingLineItems: [],
  } as unknown as SimulationSnapshot
}

const makeState = (holdings: InvestmentAccountHolding[]): SimulationState =>
  ({
    cashAccounts: [{ id: 'cash-1', balance: 5000, interestRate: 0 }],
    holdings: holdings.map((h) => ({
      id: h.id,
      investmentAccountId: h.investmentAccountId,
      name: h.name,
      holdingType: h.holdingType,
      taxType: h.taxType,
      balance: h.balance,
      costBasisEntries: [],
      returnRate: h.returnRate,
      returnStdDev: h.returnStdDev,
      taxableDistributionYield: 0,
    })),
    investmentAccounts: [
      {
        id: 'acc-1',
        contributionEntries: [],
      },
    ],
    yearLedger: {
      ordinaryIncome: 0,
      capitalGains: 0,
      deductions: 0,
      taxExemptIncome: 0,
      socialSecurityBenefits: 0,
      earnedIncome: 0,
      penalties: 0,
      taxPaid: 0,
    },
    yearContributionsByTaxType: {
      cash: 0,
      taxable: 0,
      traditional: 0,
      roth: 0,
      hsa: 0,
    },
    initialBalance: 5000 + holdings.reduce((sum, h) => sum + h.balance, 0),
  }) as unknown as SimulationState

describe('sepp72tModule', () => {
  it('returns no intents if disabled', () => {
    const snapshot = makeSnapshot({ enabled: false })
    const module = createSepp72tModule(snapshot)
    const state = makeState([makeHolding('trad-1', 'traditional', 100000)])
    const intents = module.getActionIntents?.(state, makeContext(snapshot, 50))
    expect(intents).toEqual([])
  })

  it('returns no intents if not start of year', () => {
    const snapshot = makeSnapshot()
    const module = createSepp72tModule(snapshot)
    const state = makeState([makeHolding('trad-1', 'traditional', 100000)])
    const intents = module.getActionIntents?.(state, makeContext(snapshot, 50, false))
    expect(intents).toEqual([])
  })

  it('returns no intents if age is below startAge', () => {
    const snapshot = makeSnapshot({ startAge: 52 })
    const module = createSepp72tModule(snapshot)
    const state = makeState([makeHolding('trad-1', 'traditional', 100000)])
    const intents = module.getActionIntents?.(state, makeContext(snapshot, 50))
    expect(intents).toEqual([])
  })

  it('returns no intents if age has reached max(59.5, startAge + 5)', () => {
    const snapshot = makeSnapshot({ startAge: 50 })
    const module = createSepp72tModule(snapshot)
    const state = makeState([makeHolding('trad-1', 'traditional', 100000)])
    const intents = module.getActionIntents?.(state, makeContext(snapshot, 60))
    expect(intents).toEqual([])
  })

  it('creates penalty-free withdrawal intent from traditional account', () => {
    const snapshot = makeSnapshot({ startAge: 50, annualDistribution: 25000 })
    const module = createSepp72tModule(snapshot)
    const state = makeState([
      makeHolding('trad-1', 'traditional', 100000),
      makeHolding('roth-1', 'roth', 50000),
    ])
    const intents = module.getActionIntents?.(state, makeContext(snapshot, 50))
    expect(intents).toHaveLength(1)
    expect(intents?.[0]).toMatchObject({
      kind: 'withdraw',
      amount: 25000,
      sourceHoldingId: 'trad-1',
      skipPenalty: true,
      label: '72(t) distribution',
      isSeppDistribution: true,
    })
  })

  it('draws from largest traditional holding first', () => {
    const snapshot = makeSnapshot({ startAge: 50, annualDistribution: 30000 })
    const module = createSepp72tModule(snapshot)
    const state = makeState([
      makeHolding('trad-1', 'traditional', 20000),
      makeHolding('trad-2', 'traditional', 50000),
    ])
    const intents = module.getActionIntents?.(state, makeContext(snapshot, 50))
    expect(intents).toHaveLength(1)
    expect(intents?.[0].sourceHoldingId).toBe('trad-2')
    expect(intents?.[0].amount).toBe(30000)
    expect(intents?.[0].skipPenalty).toBe(true)
  })

  it('draws from multiple traditional holdings when largest cannot cover total', () => {
    const snapshot = makeSnapshot({ startAge: 50, annualDistribution: 30000 })
    const module = createSepp72tModule(snapshot)
    const state = makeState([
      makeHolding('trad-1', 'traditional', 20000),
      makeHolding('trad-2', 'traditional', 15000),
    ])
    const intents = module.getActionIntents?.(state, makeContext(snapshot, 50))
    expect(intents).toHaveLength(2)
    expect(intents?.[0].sourceHoldingId).toBe('trad-1')
    expect(intents?.[0].amount).toBe(20000)
    expect(intents?.[1].sourceHoldingId).toBe('trad-2')
    expect(intents?.[1].amount).toBe(10000)
    expect(intents?.every((intent) => intent.skipPenalty === true)).toBe(true)
  })

  it('respects 5-year rule when starting at age 57 (active up to age 62)', () => {
    const snapshot = makeSnapshot({ startAge: 57, annualDistribution: 20000 })
    const module = createSepp72tModule(snapshot)
    const state = makeState([makeHolding('trad-1', 'traditional', 100000)])
    const intentsAge60 = module.getActionIntents?.(state, makeContext(snapshot, 60))
    expect(intentsAge60).toHaveLength(1)
    const intentsAge62 = module.getActionIntents?.(state, makeContext(snapshot, 62))
    expect(intentsAge62).toEqual([])
  })

  it('returns no intents when the 72(t) plan is busted', () => {
    const snapshot = makeSnapshot({ startAge: 50, annualDistribution: 20000 })
    const module = createSepp72tModule(snapshot)
    const state = makeState([makeHolding('trad-1', 'traditional', 100000)])
    state.sepp72tState = { isBusted: true, distributions: [] }
    const intents = module.getActionIntents?.(state, makeContext(snapshot, 52))
    expect(intents).toEqual([])
  })
})
