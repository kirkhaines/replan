import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import type { CashflowItem, SimulationModule } from '../types'
import { isSameMonth } from './utils'

export const createEventModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const events = snapshot.scenario.strategies.events
  const explain = createExplainTracker()
  return {
    id: 'events',
    explain,
    getCashflowSeries: ({ cashflows }) => {
      const totalCash = cashflows.reduce((sum, flow) => sum + flow.cash, 0)
      if (totalCash === 0) {
        return []
      }
      return [
        {
          key: 'events:cash',
          label: 'Events - cash',
          value: totalCash,
        },
      ]
    },
    getCashflows: (_state, context) => {
      const cashflows: CashflowItem[] = []
      events.forEach((event) => {
        if (!isSameMonth(context.dateIso, event.date)) {
          return
        }
        const amount = event.amount
        const cashflow: CashflowItem = {
          id: `${event.id}-${context.monthIndex}`,
          label: event.name,
          category: 'event',
          cash: amount,
        }
        if (amount > 0) {
          if (event.taxTreatment === 'ordinary') {
            cashflow.ordinaryIncome = amount
          } else if (event.taxTreatment === 'capital_gains') {
            cashflow.capitalGains = amount
          } else if (event.taxTreatment === 'tax_exempt') {
            cashflow.taxExemptIncome = amount
          }
        }
        cashflows.push(cashflow)
      })
      const netCash = cashflows.reduce((sum, flow) => sum + flow.cash, 0)
      explain.addInput('Events', events.length)
      explain.addCheckpoint('Triggered events', cashflows.length)
      explain.addCheckpoint('Net cash', netCash)
      return cashflows
    },
  }
}
