import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import type {
  ActionIntent,
  SimulationContext,
  SimulationModule,
  SimulationSettings,
  SimulationState,
} from '../types'
import { buildActionCashflowSeries } from './utils'

export const createSepp72tModule = (
  snapshot: SimulationSnapshot,
  settings?: SimulationSettings,
): SimulationModule => {
  const strategy = snapshot.scenario.strategies.sepp72t
  const explain = createExplainTracker(!settings?.summaryOnly)

  return {
    id: 'sepp72t',
    explain,
    getCashflowSeries: ({ actions, holdingTaxTypeById }) =>
      buildActionCashflowSeries({
        moduleId: 'sepp72t',
        moduleLabel: '72(t)',
        actions,
        holdingTaxTypeById,
      }),
    getActionIntents: (state: SimulationState, context: SimulationContext) => {
      explain.addInput('Enabled', strategy?.enabled ?? false)
      explain.addInput('Start age', strategy?.startAge ?? 0)
      explain.addInput('Annual distribution', strategy?.annualDistribution ?? 0)
      explain.addInput('Age', context.age)

      if (!strategy?.enabled || !context.isStartOfYear) {
        return []
      }
      if (strategy.annualDistribution <= 0 || strategy.startAge <= 0) {
        return []
      }

      // Under IRS rules, 72(t) SEPP distributions must continue until the later of
      // age 59.5 or 5 full years from the initial distribution.
      const seppEndAge = Math.max(59.5, strategy.startAge + 5)
      explain.addCheckpoint('SEPP end age', seppEndAge)

      if (context.age < strategy.startAge || context.age >= seppEndAge) {
        return []
      }

      const traditionalHoldings = state.holdings
        .filter((holding) => holding.taxType === 'traditional' && holding.balance > 0)
        .sort((a, b) => b.balance - a.balance)

      const totalTraditional = traditionalHoldings.reduce((sum, h) => sum + h.balance, 0)
      explain.addCheckpoint('Eligible traditional balance', totalTraditional)

      if (totalTraditional <= 0) {
        return []
      }

      let remaining = strategy.annualDistribution
      const intents: ActionIntent[] = []
      let priority = 25

      traditionalHoldings.forEach((holding) => {
        if (remaining <= 0) {
          return
        }
        const amount = Math.min(remaining, holding.balance)
        if (amount <= 0) {
          return
        }
        intents.push({
          id: `sepp72t-${holding.id}-${context.yearIndex}`,
          kind: 'withdraw',
          amount,
          sourceHoldingId: holding.id,
          priority,
          label: '72(t) distribution',
          skipPenalty: true, // Penalty-free 72(t) SEPP distribution
        })
        priority += 1
        remaining -= amount
      })

      explain.addCheckpoint('Distributed amount', strategy.annualDistribution - remaining)
      return intents
    },
  }
}
