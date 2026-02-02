import type { SimulationSnapshot, TaxPolicy } from '../../models'
import { createExplainTracker } from '../explain'
import { computeTax, selectSocialSecurityProvisionalIncomeBracket, selectTaxPolicy } from '../tax'
import { computePayrollTaxes, selectPayrollTaxPolicy } from '../payrollTaxes'
import { computeStateTax, selectStateTaxPolicy } from '../stateTaxes'
import type {
  CashflowSeriesEntry,
  SimulationContext,
  SimulationModule,
  SimulationSettings,
  SimulationState,
} from '../types'

export const createTaxModule = (
  snapshot: SimulationSnapshot,
  settings?: SimulationSettings,
): SimulationModule => {
  const taxStrategy = snapshot.scenario.strategies.tax
  const cpiRate = snapshot.scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
  const explain = createExplainTracker(!settings?.summaryOnly)

  const inflateTaxPolicy = (policy: TaxPolicy, year: number) => {
    if (year <= policy.year || cpiRate <= 0) {
      return policy
    }
    const factor = Math.pow(1 + cpiRate, year - policy.year)
    return {
      ...policy,
      standardDeduction: policy.standardDeduction * factor,
      ordinaryBrackets: policy.ordinaryBrackets.map((bracket) => ({
        ...bracket,
        upTo: bracket.upTo === null ? null : bracket.upTo * factor,
      })),
      capitalGainsBrackets: policy.capitalGainsBrackets.map((bracket) => ({
        ...bracket,
        upTo: bracket.upTo === null ? null : bracket.upTo * factor,
      })),
    }
  }

  const scheduleTaxPayment = (
    state: SimulationState,
    entry: {
      taxYear: number
      amount: number
      penalties: number
      taxableOrdinary: number
      taxableCapGains: number
    },
  ) => {
    const existingIndex = state.pendingTaxDue.findIndex(
      (pending) => pending.taxYear === entry.taxYear,
    )
    if (existingIndex >= 0) {
      state.pendingTaxDue[existingIndex] = entry
    } else {
      state.pendingTaxDue.push(entry)
    }
  }

  const buildTaxDue = (state: SimulationState, context: SimulationContext) => {
    const policyYear = taxStrategy.policyYear || context.date.getFullYear()
    const taxYear = context.date.getFullYear()
    const policy = selectTaxPolicy(snapshot.taxPolicies, policyYear, taxStrategy.filingStatus)
    if (!policy) {
      return null
    }
    const inflatedPolicy = inflateTaxPolicy(policy, policyYear)
    const socialSecurityBracket = selectSocialSecurityProvisionalIncomeBracket(
      snapshot.socialSecurityProvisionalIncomeBrackets,
      policyYear,
      taxStrategy.filingStatus,
    )
    const taxResult = computeTax({
      ordinaryIncome: state.yearLedger.ordinaryIncome,
      capitalGains: state.yearLedger.capitalGains,
      deductions: state.yearLedger.deductions,
      taxExemptIncome: state.yearLedger.taxExemptIncome,
      stateTaxRate: taxStrategy.stateCode === 'none' ? taxStrategy.stateTaxRate : 0,
      policy: inflatedPolicy,
      useStandardDeduction: taxStrategy.useStandardDeduction,
      applyCapitalGainsRates: taxStrategy.applyCapitalGainsRates,
      socialSecurityBenefits: state.yearLedger.socialSecurityBenefits,
      socialSecurityProvisionalBracket: socialSecurityBracket,
    })
    const stateTaxPolicy =
      taxStrategy.stateCode !== 'none'
        ? selectStateTaxPolicy(taxStrategy.stateCode, policyYear, taxStrategy.filingStatus)
        : null
    const taxableIncome = taxResult.taxableOrdinaryIncome + taxResult.taxableCapitalGains
    const stateTax = stateTaxPolicy
      ? computeStateTax({
          taxableIncome,
          policy: stateTaxPolicy,
          useStandardDeduction: taxStrategy.useStandardDeduction,
        })
      : 0
    const payrollPolicy = selectPayrollTaxPolicy(policyYear)
    const payrollTaxes = payrollPolicy
      ? computePayrollTaxes({
          earnedIncome: state.yearLedger.earnedIncome,
          filingStatus: taxStrategy.filingStatus,
          policy: payrollPolicy,
        })
      : { socialSecurityTax: 0, medicareTax: 0, totalPayrollTax: 0 }
    state.magiHistory[context.yearIndex] = taxResult.magi
    const federalTaxOwed = taxResult.taxOwed
    const totalTax =
      federalTaxOwed + stateTax + payrollTaxes.totalPayrollTax + state.yearLedger.penalties
    const taxDue = totalTax - state.yearLedger.taxPaid
    return {
      taxYear,
      taxDue,
      penalties: state.yearLedger.penalties,
      taxableOrdinary: taxResult.taxableOrdinaryIncome,
      taxableSocialSecurity: taxResult.taxableSocialSecurity,
      taxableCapGains: taxResult.taxableCapitalGains,
      totalTax,
      taxPaid: state.yearLedger.taxPaid,
      federalTaxOwed,
      stateTax,
      payrollTaxes,
    }
  }

  const monthShouldPayTaxes = (context: SimulationContext) => context.date.getMonth() === 2

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
      const penalties = lookup.get('Penalties')
      const entries: CashflowSeriesEntry[] = []
      const penaltyValue =
        typeof penalties === 'number' && penalties > 0 ? -penalties : 0
      const remainingCash = taxCash - penaltyValue
      if (penaltyValue !== 0) {
        entries.push({
          key: 'taxes:penalties',
          label: 'Taxes - penalties',
          value: penaltyValue,
          bucket: 'cash',
        })
      }
      if (typeof taxableOrdinary === 'number' && typeof taxableCapGains === 'number') {
        const total = taxableOrdinary + taxableCapGains
        if (total > 0 && remainingCash !== 0) {
          entries.push(
            {
              key: 'taxes:ordinary',
              label: 'Taxes - ordinary',
              value: (taxableOrdinary / total) * remainingCash,
              bucket: 'cash',
            },
            {
              key: 'taxes:capital_gains',
              label: 'Taxes - capital gains',
              value: (taxableCapGains / total) * remainingCash,
              bucket: 'cash',
            },
          )
          return entries
        }
      }
      if (remainingCash !== 0) {
        entries.push({
          key: 'taxes:ordinary',
          label: 'Taxes - ordinary',
          value: remainingCash,
          bucket: 'cash',
        })
      }
      return entries
    },
    getCashflows: (state, context) => {
      const policyYear = taxStrategy.policyYear || context.date.getFullYear()
      explain.addInput('Policy year', policyYear)
      explain.addInput('Filing status', taxStrategy.filingStatus)
      explain.addInput('State tax rate', taxStrategy.stateTaxRate)
      explain.addInput('State code', taxStrategy.stateCode)
      explain.addInput('Use standard deduction', taxStrategy.useStandardDeduction)
      explain.addInput('Apply cap gains rates', taxStrategy.applyCapitalGainsRates)
      if (!monthShouldPayTaxes(context)) {
        explain.addCheckpoint('Taxes applied', false)
        return []
      }
      const paymentYear = context.date.getFullYear() - 1
      const dueEntries = state.pendingTaxDue.filter(
        (entry) => entry.taxYear <= paymentYear,
      )
      if (dueEntries.length === 0) {
        explain.addCheckpoint('Taxes applied', false)
        return []
      }
      const totalDue = dueEntries.reduce((sum, entry) => sum + entry.amount, 0)
      const totalPenalties = dueEntries.reduce((sum, entry) => sum + entry.penalties, 0)
      const totalOrdinary = dueEntries.reduce((sum, entry) => sum + entry.taxableOrdinary, 0)
      const totalCapGains = dueEntries.reduce((sum, entry) => sum + entry.taxableCapGains, 0)
      explain.addCheckpoint('Taxes applied', true)
      explain.addCheckpoint('Penalties', totalPenalties)
      explain.addCheckpoint('Taxable ordinary', totalOrdinary)
      explain.addCheckpoint('Taxable cap gains', totalCapGains)
      state.pendingTaxDue = state.pendingTaxDue.filter(
        (entry) => entry.taxYear > paymentYear,
      )
      if (totalDue === 0) {
        return []
      }
      const label = totalDue > 0 ? 'Taxes due (prior year)' : 'Tax refund (prior year)'
      return [
        {
          id: `tax-${paymentYear}`,
          label,
          category: 'tax',
          cash: -totalDue,
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
      const inflatedPolicy = inflateTaxPolicy(policy, policyYear)
      const socialSecurityBracket = selectSocialSecurityProvisionalIncomeBracket(
        snapshot.socialSecurityProvisionalIncomeBrackets,
        policyYear,
        taxStrategy.filingStatus,
      )
      const monthOfYear = context.date.getMonth() + 1
      const scaleFactor = monthOfYear > 0 ? 12 / monthOfYear : 1
      const annualized = {
        ordinaryIncome: state.yearLedger.ordinaryIncome * scaleFactor,
        capitalGains: state.yearLedger.capitalGains * scaleFactor,
        deductions: state.yearLedger.deductions * scaleFactor,
        taxExemptIncome: state.yearLedger.taxExemptIncome * scaleFactor,
        socialSecurityBenefits: state.yearLedger.socialSecurityBenefits * scaleFactor,
      }
      const estimate = computeTax({
        ordinaryIncome: annualized.ordinaryIncome,
        capitalGains: annualized.capitalGains,
        deductions: annualized.deductions,
        taxExemptIncome: annualized.taxExemptIncome,
        stateTaxRate: taxStrategy.stateCode === 'none' ? taxStrategy.stateTaxRate : 0,
        policy: inflatedPolicy,
        useStandardDeduction: taxStrategy.useStandardDeduction,
        applyCapitalGainsRates: taxStrategy.applyCapitalGainsRates,
        socialSecurityBenefits: annualized.socialSecurityBenefits,
        socialSecurityProvisionalBracket: socialSecurityBracket,
      })
      const stateTaxEstimate =
        taxStrategy.stateCode !== 'none'
          ? (() => {
              const statePolicy = selectStateTaxPolicy(
                taxStrategy.stateCode,
                policyYear,
                taxStrategy.filingStatus,
              )
              if (!statePolicy) {
                return 0
              }
              return computeStateTax({
                taxableIncome: estimate.taxableOrdinaryIncome + estimate.taxableCapitalGains,
                policy: statePolicy,
                useStandardDeduction: taxStrategy.useStandardDeduction,
              })
            })()
          : 0
      const payrollEstimatePolicy = selectPayrollTaxPolicy(policyYear)
      const payrollEstimate = payrollEstimatePolicy
        ? computePayrollTaxes({
            earnedIncome: Math.max(0, annualized.ordinaryIncome),
            filingStatus: taxStrategy.filingStatus,
            policy: payrollEstimatePolicy,
          })
        : { socialSecurityTax: 0, medicareTax: 0, totalPayrollTax: 0 }
      const estimatedAnnualTax =
        estimate.taxOwed +
        stateTaxEstimate +
        payrollEstimate.totalPayrollTax +
        state.yearLedger.penalties
      const targetPaid = (estimatedAnnualTax * monthOfYear) / 12
      const withholdingDue = Math.max(0, targetPaid - state.yearLedger.taxPaid)
      explain.addCheckpoint('Federal tax (est.)', estimate.taxOwed / 12)
      explain.addCheckpoint('State tax (est.)', stateTaxEstimate / 12)
      explain.addCheckpoint('Social Security tax (est.)', payrollEstimate.socialSecurityTax / 12)
      explain.addCheckpoint('Medicare tax (est.)', payrollEstimate.medicareTax / 12)
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
    onEndOfYear: (state, context) => {
      const taxSummary = buildTaxDue(state, context)
      if (!taxSummary) {
        return
      }
      const {
        taxYear,
        taxDue,
        penalties,
      taxableOrdinary,
      taxableSocialSecurity,
      taxableCapGains,
      totalTax,
      taxPaid,
      federalTaxOwed,
      stateTax,
      payrollTaxes,
    } = taxSummary
      explain.addCheckpoint('Ordinary income', state.yearLedger.ordinaryIncome)
      explain.addCheckpoint('Capital gains', state.yearLedger.capitalGains)
      explain.addCheckpoint('Deductions', state.yearLedger.deductions)
      explain.addCheckpoint('Tax exempt', state.yearLedger.taxExemptIncome)
      explain.addCheckpoint('Social Security benefits', state.yearLedger.socialSecurityBenefits)
      explain.addCheckpoint('Federal tax', federalTaxOwed)
      explain.addCheckpoint('State tax', stateTax)
      explain.addCheckpoint('Social Security tax', payrollTaxes.socialSecurityTax)
      explain.addCheckpoint('Medicare tax', payrollTaxes.medicareTax)
      explain.addCheckpoint('Penalties', penalties)
      explain.addCheckpoint('Total tax', totalTax)
      explain.addCheckpoint('Tax paid', taxPaid)
      explain.addCheckpoint('Tax due', taxDue)
      explain.addCheckpoint('MAGI', state.magiHistory[context.yearIndex] ?? 0)
      explain.addCheckpoint('Taxable ordinary', taxableOrdinary)
      explain.addCheckpoint('Taxable Social Security', taxableSocialSecurity)
      explain.addCheckpoint('Taxable cap gains', taxableCapGains)
      if (taxDue === 0) {
        return
      }
      scheduleTaxPayment(state, {
        taxYear,
        amount: taxDue,
        penalties,
        taxableOrdinary,
        taxableCapGains,
      })
    },
  }
}
