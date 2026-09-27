import { describe, expect, it } from 'vitest'
import { createCashBufferModule } from './cashBufferModule'
import type { SimulationContext, SimulationState } from '../types'
import type { InvestmentAccountHolding, SimulationSnapshot } from '../../models'
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

const makeHolding = (
  id: string,
  taxType: InvestmentAccountHolding['taxType'],
  balance: number,
  costBasisEntries: InvestmentAccountHolding['costBasisEntries'],
  options?: {
    investmentAccountId?: string
    holdingType?: InvestmentAccountHolding['holdingType']
  },
): InvestmentAccountHolding => ({
  id,
  name: `Holding ${id}`,
  createdAt: 0,
  updatedAt: 0,
  taxType,
  balance,
  costBasisEntries,
  holdingType: options?.holdingType ?? 'sp500',
  returnRate: 0,
  returnStdDev: 0,
  investmentAccountId:
    options?.investmentAccountId ?? '00000000-0000-4000-8000-000000000003',
})

const makeSnapshot = ({
  monthlyNeed,
  holdings,
  scenarioOverrides,
}: {
  monthlyNeed: number
  holdings: InvestmentAccountHolding[]
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
        wantAmount: 0,
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
    investmentAccountHoldings: holdings,
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
  holdings: InvestmentAccountHolding[],
): SimulationState => ({
  cashAccounts: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      balance: cashBalance,
      interestRate: 0,
    },
  ],
  investmentAccounts: Array.from(
    new Set(holdings.map((holding) => holding.investmentAccountId)),
  ).map((accountId) => ({
    id: accountId,
    contributionEntries: holdings
      .filter((holding) => holding.investmentAccountId === accountId && holding.taxType === 'roth')
      .flatMap((holding) =>
        holding.costBasisEntries.map((entry) => ({
          ...entry,
          taxType: 'roth' as const,
        })),
      ),
  })),
  holdings: holdings.map((holding) => ({
    id: holding.id,
    investmentAccountId: holding.investmentAccountId,
    taxType: holding.taxType,
    holdingType: holding.holdingType,
    balance: holding.balance,
    costBasisEntries: holding.costBasisEntries.map((entry) => ({ ...entry })),
    returnRate: holding.returnRate,
    returnStdDev: holding.returnStdDev,
  })),
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
  yearContributionsByTaxType: {
    cash: 0,
    taxable: 0,
    traditional: 0,
    roth: 0,
    hsa: 0,
  },
  magiHistory: {},
  initialBalance: cashBalance + holdings.reduce((sum, holding) => sum + holding.balance, 0),
  guardrailTargetBalance: null,
  guardrailTargetDateIso: null,
  guardrailBaselineNeed: 0,
  guardrailBaselineWant: 0,
  guardrailGuytonMonthsRemaining: 0,
  guardrailFactorSum: 0,
  guardrailFactorMin: Number.POSITIVE_INFINITY,
  guardrailFactorCount: 0,
  guardrailFactorBelowCount: 0,
  marketDownturn: {
    equityMarketValue: 1,
    equityMarketHigh: 1,
    downturnHighBeforeDrop: null,
    inDownturn: false,
    inRecovery: false,
    pendingRecoveryBaseCapture: false,
    recoveryBaseBondFraction: null,
    recoveryBaseMarketValue: null,
  },
})

const makeContext = (snapshot: SimulationSnapshot, age: number): SimulationContext => {
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
    age,
    date: new Date(`${dateIso}T00:00:00Z`),
    dateIso,
    isStartOfYear: true,
    isEndOfYear: false,
    planMode: 'apply',
    summaryOnly: false,
  }
}

const mapActionTypes = (
  actions: ReturnType<NonNullable<ReturnType<typeof createCashBufferModule>['getActionIntents']>>,
  holdings: InvestmentAccountHolding[],
) => {
  const taxTypeById = new Map(holdings.map((holding) => [holding.id, holding.taxType]))
  return actions.map((action) => {
    if (action.label?.toLowerCase().includes('roth contributions')) {
      return 'roth_basis'
    }
    return action.sourceHoldingId ? taxTypeById.get(action.sourceHoldingId) : 'cash'
  })
}

describe('cashBufferModule', () => {
  it('orders withdrawals with early-penalty avoidance', () => {
    const holdings: InvestmentAccountHolding[] = []
    const snapshot = makeSnapshot({
      monthlyNeed: 0,
      holdings,
      scenarioOverrides: {
        strategies: {
          withdrawal: {
            order: ['taxable', 'roth_basis', 'traditional', 'roth', 'hsa'],
            useCashFirst: true,
            guardrailPct: 0,
            avoidEarlyPenalty: true,
            taxableGainHarvestTarget: 0,
          },
          taxableLot: {
            costBasisMethod: 'average',
            harvestLosses: false,
            gainRealizationTarget: 0,
          },
          earlyRetirement: {
            allowPenalty: true,
            penaltyRate: 0.1,
            use72t: false,
            bridgeCashYears: 0,
          },
        },
      },
    })
    const state = makeState(0, holdings)
    const module = createCashBufferModule(snapshot) as unknown as {
      __test?: { buildWithdrawalOrder: (state: SimulationState, age: number) => { order: string[] } }
    }
    const result = module.__test?.buildWithdrawalOrder(state, 48)
    expect(result).toBeDefined()
    expect(result?.order).toEqual(['taxable', 'roth_basis', 'traditional', 'roth', 'hsa'])
  })

  it('pushes traditional to the end of withdrawal order when 72(t) is enabled in the scenario', () => {
    const holdings: InvestmentAccountHolding[] = []
    const snapshot = makeSnapshot({
      monthlyNeed: 0,
      holdings,
      scenarioOverrides: {
        strategies: {
          withdrawal: {
            order: ['taxable', 'roth_basis', 'traditional', 'roth', 'hsa'],
            useCashFirst: true,
            guardrailPct: 0,
            avoidEarlyPenalty: true,
            taxableGainHarvestTarget: 0,
          },
          taxableLot: {
            costBasisMethod: 'average',
            harvestLosses: false,
            gainRealizationTarget: 0,
          },
          earlyRetirement: {
            allowPenalty: true,
            penaltyRate: 0.1,
            use72t: false,
            bridgeCashYears: 0,
          },
          sepp72t: {
            enabled: true,
            startAge: 45,
            annualDistribution: 20000,
          },
        },
      },
    })
    const state = makeState(0, holdings)
    const module = createCashBufferModule(snapshot) as unknown as {
      __test?: { buildWithdrawalOrder: (state: SimulationState, age: number) => { order: string[] } }
    }
    const result = module.__test?.buildWithdrawalOrder(state, 48)
    expect(result).toBeDefined()
    expect(result?.order).toEqual(['taxable', 'roth_basis', 'roth', 'hsa', 'traditional'])
  })

  it('avoids penalized types when early penalties are disabled', () => {
    const holdings = [
      makeHolding('holding-taxable', 'taxable', 100, []),
      makeHolding(
        'holding-roth',
        'roth',
        200,
        [{ date: '2010-01-01', amount: 120 }],
      ),
      makeHolding('holding-hsa', 'hsa', 100, []),
      makeHolding('holding-trad', 'traditional', 100, []),
    ]
    const snapshot = makeSnapshot({
      monthlyNeed: 220,
      holdings,
      scenarioOverrides: {
        strategies: {
          cashBuffer: { targetMonths: 1, minMonths: 1, maxMonths: 1 },
          withdrawal: {
            order: ['taxable', 'traditional', 'roth', 'hsa', 'roth_basis'],
            useCashFirst: true,
            guardrailPct: 0,
            avoidEarlyPenalty: true,
            taxableGainHarvestTarget: 0,
          },
          earlyRetirement: {
            allowPenalty: false,
            penaltyRate: 0.1,
            use72t: false,
            bridgeCashYears: 0,
          },
        },
      },
    })
    const module = createCashBufferModule(snapshot)
    const actions = module.getActionIntents?.(makeState(0, holdings), makeContext(snapshot, 50))
    expect(actions).toBeDefined()
    const actionTypes = mapActionTypes(actions ?? [], holdings)
    expect(actionTypes).toEqual(['taxable', 'roth_basis'])
    expect(actions?.map((action) => action.amount)).toEqual([100, 120])
  })

  it('caps roth contributions withdrawals and then uses roth for remaining need', () => {
    const holdings = [
      makeHolding(
        'holding-roth',
        'roth',
        500,
        [
          { date: '2010-01-01', amount: 200 },
          { date: '2025-01-01', amount: 100 },
        ],
      ),
    ]
    const snapshot = makeSnapshot({
      monthlyNeed: 350,
      holdings,
      scenarioOverrides: {
        strategies: {
          cashBuffer: { targetMonths: 1, minMonths: 1, maxMonths: 1 },
          withdrawal: {
            order: ['roth_basis', 'roth'],
            useCashFirst: true,
            guardrailPct: 0,
            avoidEarlyPenalty: false,
            taxableGainHarvestTarget: 0,
          },
          earlyRetirement: {
            allowPenalty: true,
            penaltyRate: 0.1,
            use72t: false,
            bridgeCashYears: 0,
          },
        },
      },
    })
    const module = createCashBufferModule(snapshot)
    const actions = module.getActionIntents?.(makeState(0, holdings), makeContext(snapshot, 60))
    expect(actions).toBeDefined()
    expect(actions?.map((action) => action.amount)).toEqual([350])
    expect(actions?.map((action) => action.label)).toEqual([
      'Refill cash buffer'
    ])
  })

  it('avoids penalized types when early penalties are disabled', () => {
    const holdings = [
      makeHolding('holding-taxable', 'taxable', 100, []),
      makeHolding(
        'holding-roth',
        'roth',
        200,
        [{ date: '2010-01-01', amount: 120 }],
      ),
      makeHolding('holding-hsa', 'hsa', 100, []),
      makeHolding('holding-trad', 'traditional', 100, []),
    ]
    const snapshot = makeSnapshot({
      monthlyNeed: 250,
      holdings,
      scenarioOverrides: {
        strategies: {
          cashBuffer: { targetMonths: 1, minMonths: 1, maxMonths: 1 },
          withdrawal: {
            order: ['taxable', 'roth_basis', 'traditional', 'roth', 'hsa'],
            useCashFirst: true,
            guardrailPct: 0,
            avoidEarlyPenalty: true,
            taxableGainHarvestTarget: 0,
          },
          earlyRetirement: {
            allowPenalty: true,
            penaltyRate: 0.1,
            use72t: false,
            bridgeCashYears: 0,
          },
        },
      },
    })
    const module = createCashBufferModule(snapshot)
    const actions = module.getActionIntents?.(makeState(0, holdings), makeContext(snapshot, 50))
    expect(actions).toBeDefined()
    const actionTypes = mapActionTypes(actions ?? [], holdings)
    expect(actionTypes).toEqual(['taxable', 'roth_basis', 'traditional'])
    expect(actions?.map((action) => action.amount)).toEqual([100, 120, 30])
  })

  it('avoids traditional when 72(t) is enabled, taking from roth before traditional', () => {
    const holdings = [
      makeHolding('holding-taxable', 'taxable', 100, []),
      makeHolding(
        'holding-roth',
        'roth',
        200,
        [{ date: '2010-01-01', amount: 120 }],
      ),
      makeHolding('holding-hsa', 'hsa', 100, []),
      makeHolding('holding-trad', 'traditional', 100, []),
    ]
    const snapshot = makeSnapshot({
      monthlyNeed: 250,
      holdings,
      scenarioOverrides: {
        strategies: {
          cashBuffer: { targetMonths: 1, minMonths: 1, maxMonths: 1 },
          withdrawal: {
            order: ['taxable', 'roth_basis', 'traditional', 'roth', 'hsa'],
            useCashFirst: true,
            guardrailPct: 0,
            avoidEarlyPenalty: true,
            taxableGainHarvestTarget: 0,
          },
          earlyRetirement: {
            allowPenalty: true,
            penaltyRate: 0.1,
            use72t: false,
            bridgeCashYears: 0,
          },
          sepp72t: {
            enabled: true,
            startAge: 45,
            annualDistribution: 20000,
          },
        },
      },
    })
    const module = createCashBufferModule(snapshot)
    const actions = module.getActionIntents?.(makeState(0, holdings), makeContext(snapshot, 50))
    expect(actions).toBeDefined()
    const actionTypes = mapActionTypes(actions ?? [], holdings)
    expect(actionTypes).toEqual(['taxable', 'roth_basis', 'roth'])
    expect(actions?.map((action) => action.amount)).toEqual([100, 120, 30])
  })

  it('sells bonds first within the same account during downturn periods', () => {
    const holdings = [
      makeHolding('holding-equity', 'taxable', 100, [], {
        holdingType: 'sp500',
      }),
      makeHolding('holding-bonds', 'taxable', 80, [], {
        holdingType: 'bonds',
      }),
    ]
    const snapshot = makeSnapshot({
      monthlyNeed: 90,
      holdings,
      scenarioOverrides: {
        strategies: {
          cashBuffer: { targetMonths: 1, minMonths: 1, maxMonths: 1 },
          glidepath: {
            mode: 'age',
            scope: 'global',
            sellBondsFirstInDownMarkets: true,
            sellBondsBelowHighThreshold: 0.85,
            targets: [],
          },
          withdrawal: {
            order: ['taxable', 'traditional', 'roth', 'hsa', 'roth_basis'],
            useCashFirst: true,
            guardrailPct: 0,
            avoidEarlyPenalty: false,
            taxableGainHarvestTarget: 0,
          },
        },
      },
    })
    const state = makeState(0, holdings)
    if (state.marketDownturn) {
      state.marketDownturn.inDownturn = true
    }
    const actions = createCashBufferModule(snapshot).getActionIntents?.(
      state,
      makeContext(snapshot, 65),
    )
    const withdrawals = (actions ?? []).filter((action) => action.kind === 'withdraw')
    expect(withdrawals.map((action) => action.sourceHoldingId)).toEqual([
      'holding-bonds',
      'holding-equity',
    ])
    expect(withdrawals.map((action) => action.amount)).toEqual([80, 10])
  })

  it('offsets downturn equity sales with bond-to-equity rebalances across accounts', () => {
    const holdings = [
      makeHolding('holding-equity-a', 'taxable', 100, [], {
        investmentAccountId: '00000000-0000-4000-8000-000000000003',
        holdingType: 'sp500',
      }),
      makeHolding('holding-bonds-b', 'taxable', 70, [], {
        investmentAccountId: '00000000-0000-4000-8000-000000000004',
        holdingType: 'bonds',
      }),
      makeHolding('holding-equity-b', 'taxable', 30, [], {
        investmentAccountId: '00000000-0000-4000-8000-000000000004',
        holdingType: 'sp500',
      }),
    ]
    const snapshot = makeSnapshot({
      monthlyNeed: 60,
      holdings,
      scenarioOverrides: {
        strategies: {
          cashBuffer: { targetMonths: 1, minMonths: 1, maxMonths: 1 },
          glidepath: {
            mode: 'age',
            scope: 'global',
            sellBondsFirstInDownMarkets: true,
            sellBondsBelowHighThreshold: 0.85,
            targets: [],
          },
          withdrawal: {
            order: ['taxable', 'traditional', 'roth', 'hsa', 'roth_basis'],
            useCashFirst: true,
            guardrailPct: 0,
            avoidEarlyPenalty: false,
            taxableGainHarvestTarget: 0,
          },
        },
      },
    })
    const state = makeState(0, holdings)
    if (state.marketDownturn) {
      state.marketDownturn.inDownturn = true
    }
    const actions = createCashBufferModule(snapshot).getActionIntents?.(
      state,
      makeContext(snapshot, 65),
    )
    expect(actions?.map((action) => action.kind)).toEqual(['withdraw', 'rebalance'])
    expect(actions?.[0]?.sourceHoldingId).toBe('holding-equity-a')
    expect(actions?.[0]?.amount).toBe(60)
    expect(actions?.[1]?.sourceHoldingId).toBe('holding-bonds-b')
    expect(actions?.[1]?.targetHoldingId).toBe('holding-equity-b')
    expect(actions?.[1]?.amount).toBe(60)
  })
})
