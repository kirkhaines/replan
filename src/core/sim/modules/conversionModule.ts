import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import { selectIrmaaTable, selectTaxPolicy } from '../tax'
import type { ActionIntent, SimulationModule } from '../types'

export const createConversionModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const { rothConversion, rothLadder, tax } = snapshot.scenario.strategies
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
    getActionIntents: (state, context) => {
      const age = context.age
      let conversionAmount = 0
      let ladderAmount = 0
      let conversionCandidate = 0

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
            ? rothLadder.annualConversion
            : rothLadder.targetAfterTaxSpending
        conversionAmount += ladderAmount
      }

      if (
        context.isStartOfYear &&
        rothConversion.enabled &&
        isAgeInRange(age, rothConversion.startAge, rothConversion.endAge)
      ) {
        if (rothConversion.targetOrdinaryBracketRate > 0) {
          const policy = selectTaxPolicy(
            snapshot.taxPolicies,
            context.date.getFullYear(),
            tax.filingStatus,
          )
          const bracket = policy?.ordinaryBrackets.find(
            (entry) => entry.rate === rothConversion.targetOrdinaryBracketRate,
          )
          if (bracket?.upTo !== null && bracket?.upTo !== undefined) {
            conversionCandidate = Math.max(0, bracket.upTo - state.yearLedger.ordinaryIncome)
          }
        }
        if (rothConversion.respectIrmaa) {
          const table = selectIrmaaTable(
            snapshot.irmaaTables,
            context.date.getFullYear(),
            tax.filingStatus,
          )
          const baseTier = table?.tiers[0]?.maxMagi ?? 0
          const currentMagi =
            state.yearLedger.ordinaryIncome +
            state.yearLedger.capitalGains +
            state.yearLedger.taxExemptIncome
          if (baseTier > 0) {
            conversionCandidate = Math.min(
              conversionCandidate,
              Math.max(0, baseTier - currentMagi),
            )
          }
        }
        if (rothConversion.minConversion > 0) {
          conversionCandidate = Math.max(conversionCandidate, rothConversion.minConversion)
        }
        if (rothConversion.maxConversion > 0) {
          conversionCandidate = Math.min(conversionCandidate, rothConversion.maxConversion)
        }
        conversionAmount += conversionCandidate
      }

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
