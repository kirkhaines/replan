import type { SimulationSnapshot } from '../../models'
import { computeIrmaaSurcharge, selectIrmaaTable } from '../tax'
import type { SimulationModule, SimulationSettings } from '../types'
import { inflateAmount } from './utils'

export const createHealthcareModule = (
  snapshot: SimulationSnapshot,
  settings: SimulationSettings,
): SimulationModule => {
  const scenario = snapshot.scenario
  const strategy = scenario.strategies.healthcare
  const taxStrategy = scenario.strategies.tax

  return {
    id: 'healthcare',
    getCashflows: (state, context) => {
      const isMedicare = context.age >= 65
      const baseMonthly = isMedicare
        ? strategy.medicarePartBMonthly + strategy.medicarePartDMonthly + strategy.medigapMonthly
        : strategy.preMedicareMonthly
      if (baseMonthly <= 0) {
        return []
      }
      const inflationRate =
        scenario.strategies.returnModel.inflationAssumptions[strategy.inflationType] ?? 0
      const inflatedBase = inflateAmount(
        baseMonthly,
        settings.startDate,
        context.dateIso,
        inflationRate,
      )
      let irmaaSurcharge = 0
      if (isMedicare && strategy.applyIrmaa) {
        const table = selectIrmaaTable(
          snapshot.irmaaTables,
          context.date.getFullYear(),
          taxStrategy.filingStatus,
        )
        const lookback = table?.lookbackYears ?? 0
        const magi = state.magiHistory[context.yearIndex - lookback] ?? 0
        const surcharge = computeIrmaaSurcharge(table, magi)
        irmaaSurcharge = surcharge.partBMonthly + surcharge.partDMonthly
      }
      const total = inflatedBase + irmaaSurcharge
      if (total <= 0) {
        return []
      }
      return [
        {
          id: `healthcare-${context.monthIndex}`,
          label: 'Healthcare',
          category: 'healthcare',
          cash: -total,
        },
      ]
    },
  }
}
