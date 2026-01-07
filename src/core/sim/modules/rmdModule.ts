import type { SimulationSnapshot } from '../../models'
import type { ActionIntent, SimulationContext, SimulationModule, SimulationState } from '../types'

export const createRmdModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const strategy = snapshot.scenario.strategies.rmd

  const computeRmd = (state: SimulationState, context: SimulationContext) => {
    if (!strategy.enabled || !context.isStartOfYear) {
      return null
    }
    if (context.age < strategy.startAge) {
      return null
    }
    const ageKey = Math.floor(context.age)
    const divisor =
      snapshot.rmdTable.find((entry) => entry.age === ageKey)?.divisor ??
      snapshot.rmdTable[snapshot.rmdTable.length - 1]?.divisor ??
      1
    const eligibleHoldings = state.holdings.filter((holding) =>
      strategy.accountTypes.includes(holding.taxType),
    )
    const totalBalance = eligibleHoldings.reduce((sum, holding) => sum + holding.balance, 0)
    if (totalBalance <= 0 || divisor <= 0) {
      return null
    }
    const totalRmd = totalBalance / divisor
    return { totalRmd, eligibleHoldings }
  }

  return {
    id: 'rmd',
    getCashflows: (state, context) => {
      const result = computeRmd(state, context)
      if (!result) {
        return []
      }
      if (strategy.withholdingRate <= 0) {
        return []
      }
      const withholding = result.totalRmd * strategy.withholdingRate
      if (withholding <= 0) {
        return []
      }
      return [
        {
          id: `rmd-withholding-${context.yearIndex}`,
          label: 'RMD withholding',
          category: 'tax',
          cash: -withholding,
        },
      ]
    },
    getActionIntents: (state, context) => {
      const result = computeRmd(state, context)
      if (!result) {
        return []
      }
      const { totalRmd, eligibleHoldings } = result
      let remaining = totalRmd
      const intents: ActionIntent[] = []
      let priority = 30
      eligibleHoldings
        .sort((a, b) => b.balance - a.balance)
        .forEach((holding) => {
          if (remaining <= 0) {
            return
          }
          const amount = Math.min(remaining, holding.balance)
          if (amount <= 0) {
            return
          }
          intents.push({
            id: `rmd-${holding.id}-${context.yearIndex}`,
            kind: 'withdraw',
            amount,
            sourceHoldingId: holding.id,
            priority,
            label: 'RMD',
          })
          priority += 1
          remaining -= amount
        })
      if (strategy.excessHandling !== 'spend') {
        const targetTaxType = strategy.excessHandling === 'roth' ? 'roth' : 'taxable'
        const targetHolding = state.holdings
          .filter((holding) => holding.taxType === targetTaxType)
          .sort((a, b) => b.balance - a.balance)[0]
        if (targetHolding) {
          intents.push({
            id: `rmd-reinvest-${targetHolding.id}-${context.yearIndex}`,
            kind: 'deposit',
            amount: totalRmd,
            targetHoldingId: targetHolding.id,
            fromCash: true,
            priority: 35,
            label: 'Reinvest RMD',
          })
        }
      }
      return intents
    },
  }
}
