import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import type { CashflowItem, SimulationModule, SimulationSettings } from '../types'
import { applyInflation } from '../../utils/inflation'
import { isWithinRange } from './utils'

export const createPensionModule = (
  snapshot: SimulationSnapshot,
  settings?: SimulationSettings,
): SimulationModule => {
  const scenario = snapshot.scenario
  const pensions = scenario.strategies.pensions
  const explain = createExplainTracker(!settings?.summaryOnly)
  return {
    id: 'pensions',
    explain,
    getCashflowSeries: ({ cashflows }) => {
      const totalCash = cashflows.reduce((sum, flow) => sum + flow.cash, 0)
      if (totalCash === 0) {
        return []
      }
      return [
        {
          key: 'pensions:cash',
          label: 'Pensions - cash',
          value: totalCash,
          bucket: 'cash',
        },
      ]
    },
    getCashflows: (_state, context) => {
      const cashflows: CashflowItem[] = []
      pensions.forEach((pension) => {
        if (!isWithinRange(context.dateIso, pension.startDate, pension.endDate)) {
          return
        }
        const amount = applyInflation({
          amount: pension.monthlyAmount,
          inflationType: pension.inflationType,
          fromDateIso: pension.startDate,
          toDateIso: context.dateIso,
          scenario,
          indexByType: context.inflationIndexByType,
          indexStartDateIso: context.inflationIndexStartDateIso,
        })
        if (amount <= 0) {
          return
        }
        const cashflow: CashflowItem = {
          id: `${pension.id}-${context.monthIndex}`,
          label: pension.name,
          category: 'pension',
          cash: amount,
        }
        if (pension.taxTreatment === 'ordinary') {
          cashflow.ordinaryIncome = amount
        } else if (pension.taxTreatment === 'capital_gains') {
          cashflow.capitalGains = amount
        } else if (pension.taxTreatment === 'tax_exempt') {
          cashflow.taxExemptIncome = amount
        }
        cashflows.push(cashflow)
      })
      const totalPayout = cashflows.reduce((sum, flow) => sum + flow.cash, 0)
      const ordinaryIncome = cashflows.reduce(
        (sum, flow) => sum + (flow.ordinaryIncome ?? 0),
        0,
      )
      explain.addInput('Pensions', pensions.length)
      explain.addCheckpoint('Total payout', totalPayout)
      explain.addCheckpoint('Ordinary income', ordinaryIncome)
      return cashflows
    },
  }
}
