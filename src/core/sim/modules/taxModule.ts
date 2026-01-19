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
    getCashflowSeries: ({ cashflows, checkpoints }) => {
      const taxCash = cashflows.reduce((sum, flow) => sum + flow.cash, 0)
      if (taxCash === 0) {
        return []
      }
      const lookup = new Map(
        (checkpoints ?? []).map((checkpoint) => [checkpoint.label, checkpoint.value]),
      )
      const taxableOrdinary = lookup.get('Taxable ordinary')
      const taxableCapGains = lookup.get('Taxable cap gains')
      if (typeof taxableOrdinary === 'number' && typeof taxableCapGains === 'number') {
        const total = taxableOrdinary + taxableCapGains
        if (total > 0) {
          return [
            {
              key: 'taxes:ordinary',
              label: 'Taxes - ordinary',
              value: (taxableOrdinary / total) * taxCash,
              bucket: 'cash',
            },
            {
              key: 'taxes:capital_gains',
              label: 'Taxes - capital gains',
              value: (taxableCapGains / total) * taxCash,
              bucket: 'cash',
            },
          ]
        }
      }
      return [
        {
          key: 'taxes:ordinary',
          label: 'Taxes - ordinary',
          value: taxCash,
          bucket: 'cash',
        },
      ]
    },
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
      const taxDue = totalTax - state.yearLedger.taxPaid
      explain.addCheckpoint('Ordinary income', state.yearLedger.ordinaryIncome)
      explain.addCheckpoint('Capital gains', state.yearLedger.capitalGains)
      explain.addCheckpoint('Deductions', state.yearLedger.deductions)
      explain.addCheckpoint('Tax exempt', state.yearLedger.taxExemptIncome)
      explain.addCheckpoint('Tax owed', taxResult.taxOwed)
      explain.addCheckpoint('Penalties', state.yearLedger.penalties)
      explain.addCheckpoint('Total tax', totalTax)
      explain.addCheckpoint('Tax paid', state.yearLedger.taxPaid)
      explain.addCheckpoint('Tax due', taxDue)
      explain.addCheckpoint('MAGI', taxResult.magi)
      explain.addCheckpoint('Taxable ordinary', taxResult.taxableOrdinaryIncome)
      explain.addCheckpoint('Taxable cap gains', taxResult.taxableCapitalGains)
      explain.addCheckpoint('Std deduction', taxResult.standardDeductionApplied)
      if (taxDue === 0) {
        return []
      }
      return [
        {
          id: `tax-${context.yearIndex}`,
          label: taxDue > 0 ? 'Taxes due' : 'Tax refund',
          category: 'tax',
          cash: -taxDue,
        },
      ]
    },
    onAfterCashflows: (cashflows, state, context) => {
      const workIncome = cashflows.reduce((sum, flow) => {
        if (flow.category !== 'work') {
          return sum
        }
        return sum + (flow.ordinaryIncome ?? 0)
      }, 0)
      if (workIncome <= 0) {
        explain.addCheckpoint('Withholding due', 0)
        return []
      }
      const policyYear = taxStrategy.policyYear || context.date.getFullYear()
      const policy = selectTaxPolicy(snapshot.taxPolicies, policyYear, taxStrategy.filingStatus)
      if (!policy) {
        explain.addCheckpoint('Withholding due', 0)
        return []
      }
      const monthOfYear = context.date.getMonth() + 1
      const scaleFactor = monthOfYear > 0 ? 12 / monthOfYear : 1
      const annualized = {
        ordinaryIncome: state.yearLedger.ordinaryIncome * scaleFactor,
        capitalGains: state.yearLedger.capitalGains * scaleFactor,
        deductions: state.yearLedger.deductions * scaleFactor,
        taxExemptIncome: state.yearLedger.taxExemptIncome * scaleFactor,
      }
      const estimate = computeTax({
        ordinaryIncome: annualized.ordinaryIncome,
        capitalGains: annualized.capitalGains,
        deductions: annualized.deductions,
        taxExemptIncome: annualized.taxExemptIncome,
        stateTaxRate: taxStrategy.stateTaxRate,
        policy,
        useStandardDeduction: taxStrategy.useStandardDeduction,
        applyCapitalGainsRates: taxStrategy.applyCapitalGainsRates,
      })
      const estimatedAnnualTax = estimate.taxOwed + state.yearLedger.penalties
      const targetPaid = (estimatedAnnualTax * monthOfYear) / 12
      const withholdingDue = Math.max(0, targetPaid - state.yearLedger.taxPaid)
      explain.addCheckpoint('Estimated annual tax', estimatedAnnualTax)
      explain.addCheckpoint('Withholding due', withholdingDue)
      if (withholdingDue <= 0) {
        return []
      }
      return [
        {
          id: `tax-withholding-${context.monthIndex}`,
          label: 'Tax withholding',
          category: 'tax',
          cash: -withholdingDue,
        },
      ]
    },
  }
}
