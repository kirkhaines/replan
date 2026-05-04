import { describe, expect, it } from 'vitest'
import { createReturnModule } from './returnModule'
import type { SimulationContext, SimulationState } from '../types'
import type { SimulationSnapshot } from '../../models'
import { buildScenario } from '../../../test/scenarioFactory'

const makeSnapshot = (): SimulationSnapshot => {
  const scenario = buildScenario()
  return {
    scenario: buildScenario({
      strategies: {
        ...scenario.strategies,
        returnModel: {
          ...scenario.strategies.returnModel,
          mode: 'deterministic',
        },
      },
    }),
  } as SimulationSnapshot
}

const makeContext = (snapshot: SimulationSnapshot): SimulationContext =>
  ({
    snapshot,
    settings: {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
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

const makeState = (
  taxType: SimulationState['holdings'][number]['taxType'],
): SimulationState =>
  ({
    cashAccounts: [],
    investmentAccounts: [],
    holdings: [
      {
        id: `holding-${taxType}`,
        name: `${taxType} bond fund`,
        investmentAccountId: '00000000-0000-4000-8000-000000000003',
        taxType,
        holdingType: 'bonds',
        balance: 12000,
        costBasisEntries: [{ date: '2026-01-01', amount: 10000 }],
        returnRate: 0.04,
        returnStdDev: 0,
        taxableDistributionYield: 0.036,
      },
    ],
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
    initialBalance: 12000,
    guardrailTargetBalance: null,
    guardrailTargetDateIso: null,
    guardrailBaselineNeed: 0,
    guardrailBaselineWant: 0,
    guardrailGuytonMonthsRemaining: 0,
    guardrailFactorSum: 0,
    guardrailFactorMin: Number.POSITIVE_INFINITY,
    guardrailFactorCount: 0,
    guardrailFactorBelowCount: 0,
  }) as SimulationState

describe('returnModule taxable distributions', () => {
  it('reports taxable holding distribution yield as ordinary income and reinvested basis', () => {
    const snapshot = makeSnapshot()
    const context = makeContext(snapshot)
    const state = makeState('taxable')
    const module = createReturnModule(snapshot, context.settings)

    const cashflows = module.getCashflows?.(state, context) ?? []
    const distribution = 12000 * (Math.pow(1 + 0.036, 1 / 12) - 1)

    expect(cashflows).toHaveLength(1)
    expect(cashflows[0]?.cash).toBe(0)
    expect(cashflows[0]?.ordinaryIncome).toBeCloseTo(distribution)

    module.onAfterCashflows?.(cashflows, state, context)

    expect(state.holdings[0]?.costBasisEntries).toContainEqual({
      date: '2026-01-01',
      amount: expect.closeTo(distribution),
    })
    expect(state.holdings[0]?.balance).toBe(12000)
  })

  it('does not report current taxable distributions inside traditional or Roth accounts', () => {
    const snapshot = makeSnapshot()
    const context = makeContext(snapshot)
    const module = createReturnModule(snapshot, context.settings)

    expect(module.getCashflows?.(makeState('traditional'), context) ?? []).toEqual([])
    expect(module.getCashflows?.(makeState('roth'), context) ?? []).toEqual([])
  })
})
