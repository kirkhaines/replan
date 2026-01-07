import type { SimulationSnapshot } from '../../models'
import { computeTax, selectTaxPolicy } from '../tax'
import type { SimulationModule } from '../types'

export const createTaxModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const taxStrategy = snapshot.scenario.strategies.tax

  return {
    id: 'taxes',
    getCashflows: (state, context) => {
      if (!context.isEndOfYear) {
        return []
      }
      const policyYear = taxStrategy.policyYear || context.date.getFullYear()
      const policy = selectTaxPolicy(snapshot.taxPolicies, policyYear, taxStrategy.filingStatus)
      if (!policy) {
        return []
      }
      const taxResult = computeTax({
        ordinaryIncome: state.yearLedger.ordinaryIncome,
        capitalGains: state.yearLedger.capitalGains,
        deductions: state.yearLedger.deductions,
        taxExemptIncome: state.yearLedger.taxExemptIncome,
        stateTaxRate: taxStrategy.stateTaxRate,
        policy,
        useStandardDeduction: taxStrategy.useStandardDeduction,
        applyCapitalGainsRates: taxStrategy.applyCapitalGainsRates,
      })
      state.magiHistory[context.yearIndex] = taxResult.magi
      const totalTax = taxResult.taxOwed + state.yearLedger.penalties
      if (totalTax <= 0) {
        return []
      }
      return [
        {
          id: `tax-${context.yearIndex}`,
          label: 'Taxes',
          category: 'tax',
          cash: -totalTax,
        },
      ]
    },
  }
}
