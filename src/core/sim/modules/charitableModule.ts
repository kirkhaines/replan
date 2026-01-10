import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import type { ActionIntent, SimulationModule } from '../types'

export const createCharitableModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const strategy = snapshot.scenario.strategies.charitable
  const explain = createExplainTracker()

  return {
    id: 'charitable',
    explain,
    getCashflows: (_state, context) => {
      explain.addInput('Annual giving', strategy.annualGiving)
      explain.addInput('Use QCD', strategy.useQcd)
      explain.addInput('QCD annual', strategy.qcdAnnualAmount)
      explain.addInput('Start age', strategy.startAge)
      explain.addInput('End age', strategy.endAge)
      if (strategy.annualGiving <= 0) {
        explain.addCheckpoint('Monthly giving', 0)
        explain.addCheckpoint('QCD monthly', 0)
        explain.addCheckpoint('Deduction', 0)
        return []
      }
      if (strategy.startAge > 0 && context.age < strategy.startAge) {
        explain.addCheckpoint('Monthly giving', 0)
        explain.addCheckpoint('QCD monthly', 0)
        explain.addCheckpoint('Deduction', 0)
        return []
      }
      if (strategy.endAge > 0 && context.age > strategy.endAge) {
        explain.addCheckpoint('Monthly giving', 0)
        explain.addCheckpoint('QCD monthly', 0)
        explain.addCheckpoint('Deduction', 0)
        return []
      }
      const monthlyGiving = strategy.annualGiving / 12
      const qcdAnnual = strategy.useQcd
        ? strategy.qcdAnnualAmount > 0
          ? Math.min(strategy.annualGiving, strategy.qcdAnnualAmount)
          : strategy.annualGiving
        : 0
      const qcdMonthly = strategy.useQcd ? qcdAnnual / 12 : 0
      const deduction =
        strategy.useQcd && context.age >= 70.5
          ? Math.max(0, monthlyGiving - qcdMonthly)
          : monthlyGiving
      explain.addCheckpoint('Monthly giving', monthlyGiving)
      explain.addCheckpoint('QCD monthly', qcdMonthly)
      explain.addCheckpoint('Deduction', deduction)
      return [
        {
          id: `charitable-${context.monthIndex}`,
          label: 'Charitable giving',
          category: 'charitable',
          cash: -monthlyGiving,
          deductions: deduction > 0 ? deduction : undefined,
        },
      ]
    },
    getActionIntents: (state, context) => {
      if (!strategy.useQcd || context.age < 70.5) {
        return []
      }
      const qcdAnnual =
        strategy.qcdAnnualAmount > 0
          ? Math.min(strategy.annualGiving, strategy.qcdAnnualAmount)
          : strategy.annualGiving
      if (qcdAnnual <= 0) {
        return []
      }
      const monthlyQcd = qcdAnnual / 12
      const sourceHolding = [...state.holdings]
        .filter((holding) => holding.taxType === 'traditional')
        .sort((a, b) => b.balance - a.balance)[0]
      if (!sourceHolding) {
        return []
      }
      const intents: ActionIntent[] = [
        {
          id: `qcd-${context.monthIndex}`,
          kind: 'withdraw',
          amount: monthlyQcd,
          sourceHoldingId: sourceHolding.id,
          taxTreatment: 'tax_exempt',
          priority: 40,
          label: 'QCD',
        },
      ]
      return intents
    },
  }
}
