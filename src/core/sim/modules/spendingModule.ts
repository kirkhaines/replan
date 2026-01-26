import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import type { CashflowItem, SimulationModule } from '../types'
import { inflateAmount, isWithinRange } from './utils'

export const createSpendingModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const scenario = snapshot.scenario
  const spendingItems = snapshot.spendingLineItems.filter(
    (item) => item.spendingStrategyId === scenario.spendingStrategyId,
  )
  const explain = createExplainTracker()

  return {
    id: 'spending',
    explain,
    getCashflowSeries: ({ cashflows }) => {
      const totalCash = cashflows.reduce((sum, flow) => sum + flow.cash, 0)
      if (totalCash === 0) {
        return []
      }
      return [
        {
          key: 'spending:cash',
          label: 'Spending - cash',
          value: totalCash,
          bucket: 'cash',
        },
      ]
    },
    getCashflows: (state, context) => {
      const cashflows: CashflowItem[] = []
      const guardrailPct = scenario.strategies.withdrawal.guardrailPct
      const totalBalance =
        state.cashAccounts.reduce((sum, account) => sum + account.balance, 0) +
        state.holdings.reduce((sum, holding) => sum + holding.balance, 0)
      const guardrailActive =
        guardrailPct > 0 && totalBalance < state.initialBalance * (1 - guardrailPct)
      const guardrailFactor = guardrailActive ? 1 - guardrailPct : 1
      spendingItems.forEach((item) => {
        if (item.isWork) {
          return
        }
        if (!isWithinRange(context.dateIso, item.startDate, item.endDate)) {
          return
        }
        const inflationRate =
          scenario.strategies.returnModel.inflationAssumptions[item.inflationType] ?? 0
        const startIso =
          item.startDate && item.startDate !== '' ? item.startDate : context.settings.startDate
        const needAmount = inflateAmount(item.needAmount, startIso, context.dateIso, inflationRate)
        const wantAmount =
          inflateAmount(item.wantAmount, startIso, context.dateIso, inflationRate) *
          guardrailFactor
        const deductionAmount = item.isPreTax ? 1 : 0

        if (needAmount > 0) {
          cashflows.push({
            id: `${item.id}-${context.monthIndex}-need`,
            label: item.name,
            category: 'spending_need',
            cash: -needAmount,
            deductions: deductionAmount ? needAmount : undefined,
          })
        }
        if (wantAmount > 0) {
          cashflows.push({
            id: `${item.id}-${context.monthIndex}-want`,
            label: item.name,
            category: 'spending_want',
            cash: -wantAmount,
            deductions: deductionAmount ? wantAmount : undefined,
          })
        }
      })
      explain.addInput('Line items', spendingItems.length)
      explain.addInput('Guardrail pct', guardrailPct)
      explain.addInput('Guardrail active', guardrailActive)
      explain.addInput('Guardrail factor', guardrailFactor)
      const needTotal = Math.abs(
        cashflows.reduce(
          (sum, flow) => (flow.category === 'spending_need' ? sum + flow.cash : sum),
          0,
        ),
      )
      const wantTotal = Math.abs(
        cashflows.reduce(
          (sum, flow) => (flow.category === 'spending_want' ? sum + flow.cash : sum),
          0,
        ),
      )
      const deductions = cashflows.reduce((sum, flow) => sum + (flow.deductions ?? 0), 0)
      explain.addCheckpoint('Need total', needTotal)
      explain.addCheckpoint('Want total', wantTotal)
      explain.addCheckpoint('Deductions', deductions)
      return cashflows
    },
  }
}
