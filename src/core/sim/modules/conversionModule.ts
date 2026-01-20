import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import { selectIrmaaTable, selectTaxPolicy } from '../tax'
import type { ActionIntent, CashflowSeriesEntry, SimulationModule } from '../types'
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
        if (rothConversion.targetOrdinaryBracketRate > 0) {
          const policyYear = context.date.getFullYear()
          const policy = selectTaxPolicy(snapshot.taxPolicies, policyYear, tax.filingStatus)
          const bracket = policy?.ordinaryBrackets.find(
            (entry) => entry.rate === rothConversion.targetOrdinaryBracketRate,
          )
          if (bracket?.upTo !== null && bracket?.upTo !== undefined) {
            const bracketCeiling = inflateFromPolicyYear(bracket.upTo, policyYear)
            conversionCandidate = Math.max(
              0,
              bracketCeiling - state.yearLedger.ordinaryIncome,
            )
          }
        }
        if (rothConversion.respectIrmaa) {
          const policyYear = context.date.getFullYear()
          const table = selectIrmaaTable(snapshot.irmaaTables, policyYear, tax.filingStatus)
          const baseTier = table?.tiers[0]?.maxMagi ?? 0
          const currentMagi =
            state.yearLedger.ordinaryIncome +
            state.yearLedger.capitalGains +
            state.yearLedger.taxExemptIncome
          if (baseTier > 0) {
            const inflatedTier = inflateFromPolicyYear(baseTier, policyYear)
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

      const sourceHolding = state.holdings.find((holding) => holding.taxType === 'traditional')
      const targetHolding = state.holdings.find((holding) => holding.taxType === 'roth')
      if (!sourceHolding || !targetHolding) {
        return []
      }

      const intents: ActionIntent[] = [
        {
          id: `conversion-${context.yearIndex}`,
          kind: 'convert',
          amount: conversionAmount,
          sourceHoldingId: sourceHolding.id,
          targetHoldingId: targetHolding.id,
          priority: 40,
          label: 'Roth conversion',
        },
      ]

      return intents
    },
  }
}
