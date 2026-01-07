import type { SimulationSnapshot } from '../../models'
import { selectIrmaaTable } from '../tax'
import type { ActionIntent, SimulationModule } from '../types'

export const createConversionModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const { rothConversion, rothLadder, tax } = snapshot.scenario.strategies

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
    getActionIntents: (state, context) => {
      if (!context.isStartOfYear) {
        return []
      }
      const age = context.age
      let conversionAmount = 0

      const ladderStartAge =
        rothLadder.startAge > 0
          ? Math.max(0, rothLadder.startAge - rothLadder.leadTimeYears)
          : 0
      const ladderEndAge =
        rothLadder.endAge > 0
          ? Math.max(0, rothLadder.endAge - rothLadder.leadTimeYears)
          : 0
      if (rothLadder.enabled && isAgeInRange(age, ladderStartAge, ladderEndAge)) {
        const ladderAmount =
          rothLadder.annualConversion > 0
            ? rothLadder.annualConversion
            : rothLadder.targetAfterTaxSpending
        conversionAmount += ladderAmount
      }

      if (rothConversion.enabled && isAgeInRange(age, rothConversion.startAge, rothConversion.endAge)) {
        let candidate = rothConversion.targetOrdinaryIncome
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
            candidate = Math.min(candidate, Math.max(0, baseTier - currentMagi))
          }
        }
        if (rothConversion.minConversion > 0) {
          candidate = Math.max(candidate, rothConversion.minConversion)
        }
        if (rothConversion.maxConversion > 0) {
          candidate = Math.min(candidate, rothConversion.maxConversion)
        }
        conversionAmount += candidate
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
