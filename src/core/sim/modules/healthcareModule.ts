import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
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
  const activeStrategyIds = new Set(scenario.personStrategyIds)
  const futureWorkStrategyIds = new Set(
    snapshot.personStrategies
      .filter((strategy) => activeStrategyIds.has(strategy.id))
      .map((strategy) => strategy.futureWorkStrategyId),
  )
  const healthPeriods = snapshot.futureWorkPeriods.filter(
    (period) =>
      futureWorkStrategyIds.has(period.futureWorkStrategyId) && period.includesHealthInsurance,
  )
  let hasOpenEndedHealth = false
  let lastHealthEndDate: string | null = null
  healthPeriods.forEach((period) => {
    const endDate = period.endDate ?? ''
    if (!endDate) {
      hasOpenEndedHealth = true
      return
    }
    if (!lastHealthEndDate || endDate > lastHealthEndDate) {
      lastHealthEndDate = endDate
    }
  })
  const explain = createExplainTracker()

  return {
    id: 'healthcare',
    explain,
    getCashflowSeries: ({ cashflows }) => {
      const totalCash = cashflows.reduce((sum, flow) => sum + flow.cash, 0)
      if (totalCash === 0) {
        return []
      }
      return [
        {
          key: 'healthcare:cash',
          label: 'Healthcare - cash',
          value: totalCash,
          bucket: 'cash',
        },
      ]
    },
    getCashflows: (state, context) => {
      if (hasOpenEndedHealth) {
        explain.addInput('Covered by work', true)
        explain.addCheckpoint('Total', 0)
        return []
      }
      if (lastHealthEndDate && context.dateIso <= lastHealthEndDate) {
        explain.addInput('Covered by work', true)
        explain.addInput('Coverage ends', lastHealthEndDate)
        explain.addCheckpoint('Total', 0)
        return []
      }
      const isMedicare = context.age >= 65
      const baseMonthly = isMedicare
        ? strategy.medicarePartBMonthly + strategy.medicarePartDMonthly + strategy.medigapMonthly
        : strategy.preMedicareMonthly
      if (baseMonthly <= 0) {
        explain.addInput('Is Medicare', isMedicare)
        explain.addInput('Inflation type', strategy.inflationType)
        explain.addInput('Apply IRMAA', strategy.applyIrmaa)
        explain.addInput('Base monthly', baseMonthly)
        explain.addCheckpoint('Inflated base', 0)
        explain.addCheckpoint('IRMAA surcharge', 0)
        explain.addCheckpoint('Total', 0)
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
      let magiLookback: number | null = null
      let magi = 0
      if (isMedicare && strategy.applyIrmaa) {
        const table = selectIrmaaTable(
          snapshot.irmaaTables,
          context.date.getFullYear(),
          taxStrategy.filingStatus,
        )
        magiLookback = table?.lookbackYears ?? 0
        magi = state.magiHistory[context.yearIndex - magiLookback] ?? 0
        const surcharge = computeIrmaaSurcharge(table, magi)
        irmaaSurcharge = surcharge.partBMonthly + surcharge.partDMonthly
      }
      const total = inflatedBase + irmaaSurcharge
      explain.addInput('Is Medicare', isMedicare)
      explain.addInput('Inflation type', strategy.inflationType)
      explain.addInput('Apply IRMAA', strategy.applyIrmaa)
      explain.addInput('Base monthly', baseMonthly)
      if (magiLookback !== null) {
        explain.addInput('IRMAA lookback years', magiLookback)
      }
      explain.addCheckpoint('Inflated base', inflatedBase)
      explain.addCheckpoint('IRMAA surcharge', irmaaSurcharge)
      explain.addCheckpoint('Total', total)
      if (strategy.applyIrmaa) {
        explain.addCheckpoint('MAGI', magi)
      }
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
