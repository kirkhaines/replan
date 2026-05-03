import { describe, expect, it } from 'vitest'
import { createRebalancingModule } from './rebalancingModule'
import type { SimulationContext, SimulationState } from '../types'
import type { InvestmentAccountHolding, SimulationSnapshot } from '../../models'
import { buildScenario } from '../../../test/scenarioFactory'

const makeHolding = (
  id: string,
  holdingType: InvestmentAccountHolding['holdingType'],
  balance: number,
): InvestmentAccountHolding => ({
  id,
  name: `Holding ${id}`,
  createdAt: 0,
  updatedAt: 0,
  taxType: 'taxable',
  balance,
  costBasisEntries: [{ date: '2026-01-01', amount: balance }],
  holdingType,
  returnRate: 0,
  returnStdDev: 0,
  investmentAccountId: '00000000-0000-4000-8000-000000000003',
})

const makeSnapshot = (snapshot: Partial<SimulationSnapshot>): SimulationSnapshot =>
  snapshot as SimulationSnapshot

const makeState = (
  holdings: InvestmentAccountHolding[],
  marketDownturn?: SimulationState['marketDownturn'],
): SimulationState =>
  ({
    cashAccounts: [],
    investmentAccounts: [],
    holdings: holdings.map((holding) => ({
      id: holding.id,
      name: holding.name,
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
    pendingTaxDue: [],
    yearContributionsByTaxType: {
      cash: 0,
      taxable: 0,
      traditional: 0,
      roth: 0,
      hsa: 0,
    },
    magiHistory: {},
    initialBalance: holdings.reduce((sum, holding) => sum + holding.balance, 0),
    guardrailTargetBalance: null,
    guardrailTargetDateIso: null,
    guardrailBaselineNeed: 0,
    guardrailBaselineWant: 0,
    guardrailGuytonMonthsRemaining: 0,
    guardrailFactorSum: 0,
    guardrailFactorMin: Number.POSITIVE_INFINITY,
    guardrailFactorCount: 0,
    guardrailFactorBelowCount: 0,
    marketDownturn,
  }) as SimulationState

const makeContext = (snapshot: SimulationSnapshot): SimulationContext =>
  ({
    snapshot,
    settings: {
      startDate: '2026-01-01',
      endDate: '2026-01-01',
      months: 1,
      stepMonths: 1,
      summaryOnly: false,
    },
    monthIndex: 0,
    yearIndex: 0,
    age: 65,
    date: new Date('2026-01-01T00:00:00Z'),
    dateIso: '2026-01-01',
    isStartOfYear: true,
    isEndOfYear: false,
    planMode: 'apply',
    summaryOnly: false,
  }) as SimulationContext

describe('rebalancingModule downturn behavior', () => {
  it('ignores bonds during downturn rebalancing', () => {
    const baseScenario = buildScenario()
    const scenario = {
      ...baseScenario,
      strategies: {
        ...baseScenario.strategies,
        glidepath: {
          ...baseScenario.strategies.glidepath,
          sellBondsFirstInDownMarkets: true,
          sellBondsBelowHighThreshold: 0.85,
          targets: [{ age: 65, equity: 0.8, bonds: 0.2, realEstate: 0, other: 0 }],
        },
        rebalancing: {
          ...baseScenario.strategies.rebalancing,
          frequency: 'monthly',
          driftThreshold: 0,
        },
      },
    }
    const snapshot = makeSnapshot({ scenario })
    const holdings = [
      makeHolding('holding-equity', 'sp500', 20),
      makeHolding('holding-bonds', 'bonds', 80),
    ]
    const state = makeState(holdings, {
      equityMarketValue: 0.7,
      equityMarketHigh: 1,
      downturnHighBeforeDrop: 1,
      inDownturn: true,
      inRecovery: false,
      pendingRecoveryBaseCapture: false,
      recoveryBaseBondFraction: null,
      recoveryBaseMarketValue: null,
    })

    const actions = createRebalancingModule(snapshot).getActionIntents?.(
      state,
      makeContext(snapshot),
    )
    expect(actions ?? []).toHaveLength(0)
  })

  it('caps bond allocation during recovery and exits recovery when cap exceeds glidepath', () => {
    const baseScenario = buildScenario()
    const scenario = {
      ...baseScenario,
      strategies: {
        ...baseScenario.strategies,
        glidepath: {
          ...baseScenario.strategies.glidepath,
          sellBondsFirstInDownMarkets: true,
          sellBondsBelowHighThreshold: 0.85,
          targets: [{ age: 65, equity: 0.4, bonds: 0.6, realEstate: 0, other: 0 }],
        },
        rebalancing: {
          ...baseScenario.strategies.rebalancing,
          frequency: 'monthly',
          driftThreshold: 0,
        },
      },
    }
    const snapshot = makeSnapshot({ scenario })
    const holdings = [
      makeHolding('holding-equity', 'sp500', 90),
      makeHolding('holding-bonds', 'bonds', 10),
    ]
    const state = makeState(holdings, {
      equityMarketValue: 1,
      equityMarketHigh: 1,
      downturnHighBeforeDrop: null,
      inDownturn: false,
      inRecovery: true,
      pendingRecoveryBaseCapture: false,
      recoveryBaseBondFraction: 0.5,
      recoveryBaseMarketValue: 0.8,
    })

    const actions = createRebalancingModule(snapshot).getActionIntents?.(
      state,
      makeContext(snapshot),
    )
    expect(state.marketDownturn?.inRecovery).toBe(false)
    expect((actions ?? []).some((action) => action.targetHoldingId === 'holding-bonds')).toBe(
      true,
    )
  })
})
