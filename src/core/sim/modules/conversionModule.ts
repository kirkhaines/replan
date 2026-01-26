import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import {
  computeTax,
  computeTaxableSocialSecurity,
  selectIrmaaTable,
  selectSocialSecurityProvisionalIncomeBracket,
  selectTaxPolicy,
} from '../tax'
import { estimateCashBufferWithdrawals } from './cashBufferModule'
import type {
  ActionIntent,
  CashflowSeriesEntry,
  SimulationModule,
} from '../types'
import { computeStateTax, selectStateTaxPolicy } from '../stateTaxes'
import { inflateAmount } from './utils'

export const createConversionModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const { rothConversion, rothLadder, tax } = snapshot.scenario.strategies
  const cpiRate = snapshot.scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
  const explain = createExplainTracker()

  const isAgeInRange = (age: number, startAge: number, endAge: number) => {
    if (startAge > 0 && age < startAge) {
      return false
    }
    if (endAge > 0 && age > endAge) {
      return false
    }
    return true
  }

  return {
    id: 'conversions',
    explain,
    planYear: (state, context) => {
      if (!context.isStartOfYear) {
        return null
      }
      if (!rothConversion.enabled) {
        return { conversionAmount: 0 }
      }
      if (!isAgeInRange(context.age, rothConversion.startAge, rothConversion.endAge)) {
        return { conversionAmount: 0 }
      }

      const inflateFromStart = (amount: number) =>
        inflateAmount(amount, context.settings.startDate, context.dateIso, cpiRate)
      const inflateFromPolicyYear = (amount: number, year: number) =>
        inflateAmount(amount, `${year}-01-01`, context.dateIso, cpiRate)
      const policyYear = context.date.getFullYear()
      const policy = selectTaxPolicy(snapshot.taxPolicies, policyYear, tax.filingStatus)
      if (!policy) {
        return { conversionAmount: 0 }
      }
      const policyBaseYear = policy.year ?? policyYear
      const socialSecurityBracket = selectSocialSecurityProvisionalIncomeBracket(
        snapshot.socialSecurityProvisionalIncomeBrackets,
        policyYear,
        tax.filingStatus,
      )
      const { taxableBenefits: taxableSocialSecurity } = computeTaxableSocialSecurity({
        benefits: state.yearLedger.socialSecurityBenefits,
        ordinaryIncome: state.yearLedger.ordinaryIncome,
        capitalGains: state.yearLedger.capitalGains,
        taxExemptIncome: state.yearLedger.taxExemptIncome,
        bracket: socialSecurityBracket,
      })
      const currentTaxableOrdinary = state.yearLedger.ordinaryIncome + taxableSocialSecurity

      let conversionCandidate = 0
      let irmaaHeadroom = Number.POSITIVE_INFINITY
      if (rothConversion.targetOrdinaryBracketRate > 0) {
        const bracket = policy.ordinaryBrackets.find(
          (entry) => entry.rate === rothConversion.targetOrdinaryBracketRate,
        )
        if (bracket?.upTo !== null && bracket?.upTo !== undefined) {
          const bracketCeiling = inflateFromPolicyYear(bracket.upTo, policyBaseYear)
          conversionCandidate = Math.max(0, bracketCeiling - currentTaxableOrdinary)
        }
      }

      if (rothConversion.respectIrmaa) {
        const table = selectIrmaaTable(snapshot.irmaaTables, policyYear, tax.filingStatus)
        const baseTier = table?.tiers[0]?.maxMagi ?? 0
        if (baseTier > 0) {
          const tableBaseYear = table?.year ?? policyBaseYear
          const inflatedTier = inflateFromPolicyYear(baseTier, tableBaseYear)
          const currentMagi =
            currentTaxableOrdinary +
            state.yearLedger.capitalGains +
            state.yearLedger.taxExemptIncome
          irmaaHeadroom = Math.max(0, inflatedTier - currentMagi)
          conversionCandidate = Math.min(conversionCandidate, irmaaHeadroom)
        }
      }

      if (rothConversion.minConversion > 0) {
        conversionCandidate = Math.max(
          conversionCandidate,
          inflateFromStart(rothConversion.minConversion),
        )
      }
      if (rothConversion.maxConversion > 0) {
        conversionCandidate = Math.min(
          conversionCandidate,
          inflateFromStart(rothConversion.maxConversion),
        )
      }

      if (conversionCandidate <= 0) {
        return { conversionAmount: 0 }
      }

      const baseTax = (() => {
        const result = computeTax({
          ordinaryIncome: state.yearLedger.ordinaryIncome,
          capitalGains: state.yearLedger.capitalGains,
          deductions: state.yearLedger.deductions,
          taxExemptIncome: state.yearLedger.taxExemptIncome,
          stateTaxRate: tax.stateCode === 'none' ? tax.stateTaxRate : 0,
          policy,
          useStandardDeduction: tax.useStandardDeduction,
          applyCapitalGainsRates: tax.applyCapitalGainsRates,
          socialSecurityBenefits: state.yearLedger.socialSecurityBenefits,
          socialSecurityProvisionalBracket: socialSecurityBracket,
        })
        const statePolicy =
          tax.stateCode !== 'none'
            ? selectStateTaxPolicy(tax.stateCode, policyYear, tax.filingStatus)
            : null
        const stateTax = statePolicy
          ? computeStateTax({
              taxableIncome: result.taxableOrdinaryIncome + result.taxableCapitalGains,
              policy: statePolicy,
              useStandardDeduction: tax.useStandardDeduction,
            })
          : 0
        return result.taxOwed + stateTax
      })()

      const clampPlanned = (value: number, traditionalTaxWithdrawal: number) => {
        let next = Math.max(0, value)
        if (Number.isFinite(irmaaHeadroom)) {
          next = Math.min(next, Math.max(0, irmaaHeadroom - traditionalTaxWithdrawal))
        }
        if (rothConversion.minConversion > 0) {
          next = Math.max(next, inflateFromStart(rothConversion.minConversion))
        }
        if (rothConversion.maxConversion > 0) {
          next = Math.min(next, inflateFromStart(rothConversion.maxConversion))
        }
        return next
      }

      let planned = conversionCandidate
      let traditionalTaxWithdrawal = 0
      const plannedSequence: number[] = []
      for (let i = 0; i < 5; i += 1) {
        const projectedOrdinary =
          state.yearLedger.ordinaryIncome + planned + traditionalTaxWithdrawal
        const projected = computeTax({
          ordinaryIncome: projectedOrdinary,
          capitalGains: state.yearLedger.capitalGains,
          deductions: state.yearLedger.deductions,
          taxExemptIncome: state.yearLedger.taxExemptIncome,
          stateTaxRate: tax.stateCode === 'none' ? tax.stateTaxRate : 0,
          policy,
          useStandardDeduction: tax.useStandardDeduction,
          applyCapitalGainsRates: tax.applyCapitalGainsRates,
          socialSecurityBenefits: state.yearLedger.socialSecurityBenefits,
          socialSecurityProvisionalBracket: socialSecurityBracket,
        })
        const statePolicy =
          tax.stateCode !== 'none'
            ? selectStateTaxPolicy(tax.stateCode, policyYear, tax.filingStatus)
            : null
        const stateTax = statePolicy
          ? computeStateTax({
              taxableIncome: projected.taxableOrdinaryIncome + projected.taxableCapitalGains,
              policy: statePolicy,
              useStandardDeduction: tax.useStandardDeduction,
            })
          : 0
        const totalTax = projected.taxOwed + stateTax
        const deltaTax = Math.max(0, totalTax - baseTax)
        const estimate = estimateCashBufferWithdrawals(snapshot, state, context, deltaTax)
        traditionalTaxWithdrawal = estimate.byTaxType.traditional ?? 0
        let nextPlanned = conversionCandidate - traditionalTaxWithdrawal
        nextPlanned = clampPlanned(nextPlanned, traditionalTaxWithdrawal)
        plannedSequence.push(nextPlanned)
        if (plannedSequence.length >= 3) {
          const x0 = plannedSequence[plannedSequence.length - 3]
          const x1 = plannedSequence[plannedSequence.length - 2]
          const x2 = plannedSequence[plannedSequence.length - 1]
          const denom = x2 - 2 * x1 + x0
          if (Math.abs(denom) > 1e-6) {
            const aitken = x0 - ((x1 - x0) ** 2) / denom
            nextPlanned = clampPlanned(aitken, traditionalTaxWithdrawal)
          }
        }
        if (Math.abs(nextPlanned - planned) < 1) {
          planned = nextPlanned
          break
        }
        planned = nextPlanned
      }

      return { conversionAmount: planned }
    },
    getCashflowSeries: ({ actions, holdingTaxTypeById }) => {
      const entries: CashflowSeriesEntry[] = []
      actions.forEach((action) => {
        if (action.kind !== 'convert') {
          return
        }
        const amount = action.resolvedAmount ?? action.amount
        const sourceTax = action.sourceHoldingId
          ? holdingTaxTypeById.get(action.sourceHoldingId)
          : undefined
        const targetTax = action.targetHoldingId
          ? holdingTaxTypeById.get(action.targetHoldingId)
          : undefined
        if (sourceTax) {
          entries.push({
            key: `conversions:${sourceTax}`,
            label: `Conversions - ${sourceTax}`,
            value: -amount,
            bucket: sourceTax,
          })
        }
        if (targetTax) {
          entries.push({
            key: `conversions:${targetTax}`,
            label: `Conversions - ${targetTax}`,
            value: amount,
            bucket: targetTax,
          })
        }
      })
      return entries
    },
    getActionIntents: (state, context) => {
      if (context.planMode === 'preview') {
        return []
      }
      const age = context.age
      let conversionAmount = 0
      let ladderAmount = 0
      let conversionCandidate = 0
      const inflateFromStart = (amount: number) =>
        inflateAmount(amount, context.settings.startDate, context.dateIso, cpiRate)
      const inflateFromPolicyYear = (amount: number, year: number) =>
        inflateAmount(amount, `${year}-01-01`, context.dateIso, cpiRate)

      const ladderStartAge =
        rothLadder.startAge > 0
          ? Math.max(0, rothLadder.startAge - rothLadder.leadTimeYears)
          : 0
      const ladderEndAge =
        rothLadder.endAge > 0
          ? Math.max(0, rothLadder.endAge - rothLadder.leadTimeYears)
          : 0
      if (context.isStartOfYear && rothLadder.enabled && isAgeInRange(age, ladderStartAge, ladderEndAge)) {
        ladderAmount =
          rothLadder.annualConversion > 0
            ? inflateFromStart(rothLadder.annualConversion)
            : inflateFromStart(rothLadder.targetAfterTaxSpending)
      }

      if (
        context.isStartOfYear &&
        rothConversion.enabled &&
        isAgeInRange(age, rothConversion.startAge, rothConversion.endAge)
      ) {
        if (typeof context.yearPlan?.conversionAmount === 'number') {
          conversionCandidate = context.yearPlan.conversionAmount
          explain.addCheckpoint('Planned conversion', conversionCandidate)
        } else {
          const policyYear = context.date.getFullYear()
          const socialSecurityBracket = selectSocialSecurityProvisionalIncomeBracket(
            snapshot.socialSecurityProvisionalIncomeBrackets,
            policyYear,
            tax.filingStatus,
          )
          const { taxableBenefits: taxableSocialSecurity } = computeTaxableSocialSecurity({
            benefits: state.yearLedger.socialSecurityBenefits,
            ordinaryIncome: state.yearLedger.ordinaryIncome,
            capitalGains: state.yearLedger.capitalGains,
            taxExemptIncome: state.yearLedger.taxExemptIncome,
            bracket: socialSecurityBracket,
          })
          const currentTaxableOrdinary = state.yearLedger.ordinaryIncome + taxableSocialSecurity
          const currentMagi =
            currentTaxableOrdinary +
            state.yearLedger.capitalGains +
            state.yearLedger.taxExemptIncome
          if (rothConversion.targetOrdinaryBracketRate > 0) {
            const policy = selectTaxPolicy(snapshot.taxPolicies, policyYear, tax.filingStatus)
            const bracket = policy?.ordinaryBrackets.find(
              (entry) => entry.rate === rothConversion.targetOrdinaryBracketRate,
            )
            if (bracket?.upTo !== null && bracket?.upTo !== undefined) {
              const policyBaseYear = policy?.year ?? policyYear
              const bracketCeiling = inflateFromPolicyYear(bracket.upTo, policyBaseYear)
              conversionCandidate = Math.max(
                0,
                bracketCeiling - currentTaxableOrdinary,
              )
            }
          }
          if (rothConversion.respectIrmaa) {
            const policy = selectTaxPolicy(snapshot.taxPolicies, policyYear, tax.filingStatus)
            const table = selectIrmaaTable(snapshot.irmaaTables, policyYear, tax.filingStatus)
            const baseTier = table?.tiers[0]?.maxMagi ?? 0
            if (baseTier > 0) {
              const policyBaseYear = policy?.year ?? policyYear
              const tableBaseYear = table?.year ?? policyBaseYear
              const inflatedTier = inflateFromPolicyYear(baseTier, tableBaseYear)
              conversionCandidate = Math.min(
                conversionCandidate,
                Math.max(0, inflatedTier - currentMagi),
              )
            }
          }
          if (rothConversion.minConversion > 0) {
            conversionCandidate = Math.max(
              conversionCandidate,
              inflateFromStart(rothConversion.minConversion),
            )
          }
          if (rothConversion.maxConversion > 0) {
            conversionCandidate = Math.min(
              conversionCandidate,
              inflateFromStart(rothConversion.maxConversion),
            )
          }
        }
      }
      conversionAmount = Math.max(ladderAmount, conversionCandidate)

      explain.addInput('Roth ladder', rothLadder.enabled)
      explain.addInput('Roth conversion', rothConversion.enabled)
      explain.addInput('Age', age)
      explain.addInput('Target bracket rate', rothConversion.targetOrdinaryBracketRate)
      explain.addInput('Respect IRMAA', rothConversion.respectIrmaa)
      explain.addInput('Min conversion', rothConversion.minConversion)
      explain.addInput('Max conversion', rothConversion.maxConversion)
      explain.addCheckpoint('Ladder amount', ladderAmount)
      explain.addCheckpoint('Conversion candidate', conversionCandidate)
      explain.addCheckpoint('Conversion total', conversionAmount)

      if (!context.isStartOfYear) {
        return []
      }
      if (conversionAmount <= 0) {
        return []
      }

      const sourceHoldings = state.holdings
        .filter((holding) => holding.taxType === 'traditional' && holding.balance > 0)
        .sort((a, b) => b.balance - a.balance)
      const targetHolding = state.holdings.find((holding) => holding.taxType === 'roth')
      if (sourceHoldings.length === 0 || !targetHolding) {
        return []
      }

      const intents: ActionIntent[] = []
      let remaining = conversionAmount
      let priority = 40
      sourceHoldings.forEach((holding) => {
        if (remaining <= 0) {
          return
        }
        const amount = Math.min(remaining, holding.balance)
        if (amount <= 0) {
          return
        }
        intents.push({
          id: `conversion-${context.yearIndex}-${holding.id}`,
          kind: 'convert',
          amount,
          sourceHoldingId: holding.id,
          targetHoldingId: targetHolding.id,
          priority,
          label: 'Roth conversion',
        })
        remaining -= amount
        priority += 1
      })

      return intents
    },
  }
}
