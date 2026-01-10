import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import { computeTax, selectTaxPolicy } from '../tax'
import type { SimulationModule } from '../types'

export const createTaxModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const taxStrategy = snapshot.scenario.strategies.tax
  const explain = createExplainTracker()

  return {
    id: 'taxes',
    explain,
    getCashflows: (state, context) => {
      const policyYear = taxStrategy.policyYear || context.date.getFullYear()
      explain.addInput('Policy year', policyYear)
      explain.addInput('Filing status', taxStrategy.filingStatus)
      explain.addInput('State tax rate', taxStrategy.stateTaxRate)
      explain.addInput('Use standard deduction', taxStrategy.useStandardDeduction)
      explain.addInput('Apply cap gains rates', taxStrategy.applyCapitalGainsRates)
      if (!context.isEndOfYear) {
        explain.addCheckpoint('Taxes applied', false)
        return []
      }
      const policy = selectTaxPolicy(snapshot.taxPolicies, policyYear, taxStrategy.filingStatus)
      if (!policy) {
        explain.addCheckpoint('Taxes applied', false)
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
      explain.addCheckpoint('Ordinary income', state.yearLedger.ordinaryIncome)
      explain.addCheckpoint('Capital gains', state.yearLedger.capitalGains)
      explain.addCheckpoint('Deductions', state.yearLedger.deductions)
      explain.addCheckpoint('Tax exempt', state.yearLedger.taxExemptIncome)
      explain.addCheckpoint('Tax owed', taxResult.taxOwed)
      explain.addCheckpoint('Penalties', state.yearLedger.penalties)
      explain.addCheckpoint('Total tax', totalTax)
      explain.addCheckpoint('MAGI', taxResult.magi)
      explain.addCheckpoint('Taxable ordinary', taxResult.taxableOrdinaryIncome)
      explain.addCheckpoint('Taxable cap gains', taxResult.taxableCapitalGains)
      explain.addCheckpoint('Std deduction', taxResult.standardDeductionApplied)
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
