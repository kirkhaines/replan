import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import { computeIrmaaSurcharge, selectIrmaaTable } from '../tax'
import type { SimulationModule, SimulationSettings } from '../types'
import { applyInflation } from '../../utils/inflation'
import { getYearFromIsoDate } from '../../utils/date'

export const createHealthcareModule = (
  snapshot: SimulationSnapshot,
  settings: SimulationSettings,
): SimulationModule => {
  const scenario = snapshot.scenario
  const strategy = scenario.strategies.healthcare
  const taxStrategy = scenario.strategies.tax
  const primaryStrategyId = scenario.personStrategyIds[0]
  const primaryStrategy = snapshot.personStrategies.find(
    (entry) => entry.id === primaryStrategyId,
  )
  const primaryPerson = primaryStrategy
    ? snapshot.people.find((person) => person.id === primaryStrategy.personId)
    : snapshot.people[0]
  const lifeExpectancy = primaryPerson?.lifeExpectancy ?? 0
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
  const explain = createExplainTracker(!settings.summaryOnly)

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
      const longTermCareDuration = strategy.longTermCareDurationYears ?? 0
      const longTermCareStartAge =
        lifeExpectancy > 0 && longTermCareDuration > 0
          ? Math.max(0, lifeExpectancy - longTermCareDuration)
          : null
      const longTermCareEndAge = lifeExpectancy > 0 ? lifeExpectancy : null
      const decliningStartAge = strategy.decliningHealthStartAge ?? 0
      const decliningDuration = strategy.decliningHealthTreatmentDurationYears ?? 0

      let extraMonthly = 0
      let longTermCareMonthly = 0
      let decliningMonthly = 0
      if (longTermCareStartAge !== null) {
        const inLongTermCare =
          context.age >= longTermCareStartAge &&
          (longTermCareEndAge === null || context.age <= longTermCareEndAge)
        if (inLongTermCare && strategy.longTermCareAnnualExpense > 0) {
          longTermCareMonthly =
            applyInflation({
              amount: strategy.longTermCareAnnualExpense,
              inflationType: strategy.inflationType,
              fromDateIso: settings.startDate,
              toDateIso: context.dateIso,
              scenario,
              indexByType: context.inflationIndexByType,
              indexStartDateIso: context.inflationIndexStartDateIso,
            }) / 12
          extraMonthly += longTermCareMonthly
        }
      }

      if (decliningStartAge > 0 && context.age >= decliningStartAge) {
        const treatmentEndAge = decliningStartAge + Math.max(0, decliningDuration)
        if (decliningDuration > 0 && context.age < treatmentEndAge) {
          if (strategy.decliningHealthAnnualExpense > 0) {
            decliningMonthly =
              applyInflation({
                amount: strategy.decliningHealthAnnualExpense,
                inflationType: strategy.inflationType,
                fromDateIso: settings.startDate,
                toDateIso: context.dateIso,
                scenario,
                indexByType: context.inflationIndexByType,
                indexStartDateIso: context.inflationIndexStartDateIso,
              }) / 12
            extraMonthly += decliningMonthly
          }
        } else if (strategy.decliningHealthPostTreatmentAnnualExpense > 0) {
          decliningMonthly =
            applyInflation({
              amount: strategy.decliningHealthPostTreatmentAnnualExpense,
              inflationType: strategy.inflationType,
              fromDateIso: settings.startDate,
              toDateIso: context.dateIso,
              scenario,
              indexByType: context.inflationIndexByType,
              indexStartDateIso: context.inflationIndexStartDateIso,
            }) / 12
          extraMonthly += decliningMonthly
        }
      }

      if (baseMonthly <= 0 && extraMonthly <= 0) {
        explain.addInput('Is Medicare', isMedicare)
        explain.addInput('Inflation type', strategy.inflationType)
        explain.addInput('Apply IRMAA', strategy.applyIrmaa)
        explain.addInput('Base monthly', baseMonthly)
        explain.addCheckpoint('Inflated base', 0)
        explain.addCheckpoint('IRMAA surcharge', 0)
        explain.addCheckpoint('Long-term care', 0)
        explain.addCheckpoint('Declining health', 0)
        explain.addCheckpoint('Total', 0)
        return []
      }
      const inflatedBase = applyInflation({
        amount: baseMonthly,
        inflationType: strategy.inflationType,
        fromDateIso: settings.startDate,
        toDateIso: context.dateIso,
        scenario,
        indexByType: context.inflationIndexByType,
        indexStartDateIso: context.inflationIndexStartDateIso,
      })
      let irmaaSurcharge = 0
      let magiLookback: number | null = null
      let magi = 0
      if (isMedicare && strategy.applyIrmaa) {
        const table = selectIrmaaTable(
          snapshot.irmaaTables,
          getYearFromIsoDate(context.dateIso) ?? 0,
          taxStrategy.filingStatus,
        )
        magiLookback = table?.lookbackYears ?? 0
        magi = state.magiHistory[context.yearIndex - magiLookback] ?? 0
        const surcharge = computeIrmaaSurcharge(table, magi)
        irmaaSurcharge = surcharge.partBMonthly + surcharge.partDMonthly
      }
      const total = inflatedBase + irmaaSurcharge + extraMonthly
      explain.addInput('Is Medicare', isMedicare)
      explain.addInput('Inflation type', strategy.inflationType)
      explain.addInput('Apply IRMAA', strategy.applyIrmaa)
      explain.addInput('Base monthly', baseMonthly)
      explain.addInput('Long-term care level', strategy.longTermCareLevel)
      explain.addInput('Long-term care duration (years)', longTermCareDuration)
      if (longTermCareStartAge !== null) {
        explain.addInput('Long-term care start age', longTermCareStartAge)
      }
      if (longTermCareEndAge !== null) {
        explain.addInput('Long-term care end age', longTermCareEndAge)
      }
      explain.addInput('Declining health start age', decliningStartAge)
      explain.addInput('Declining health duration (years)', decliningDuration)
      if (magiLookback !== null) {
        explain.addInput('IRMAA lookback years', magiLookback)
      }
      explain.addCheckpoint('Inflated base', inflatedBase)
      explain.addCheckpoint('IRMAA surcharge', irmaaSurcharge)
      explain.addCheckpoint('Long-term care', longTermCareMonthly)
      explain.addCheckpoint('Declining health', decliningMonthly)
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
