import type { SimulationSnapshot } from '../../models'
import type { ActionIntent, SimulationModule } from '../types'

export const createCharitableModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const strategy = snapshot.scenario.strategies.charitable

  return {
    id: 'charitable',
    getCashflows: (_state, context) => {
      if (strategy.annualGiving <= 0) {
        return []
      }
      if (strategy.startAge > 0 && context.age < strategy.startAge) {
        return []
      }
      if (strategy.endAge > 0 && context.age > strategy.endAge) {
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
