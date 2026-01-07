import type { SimulationSnapshot } from '../../models'
import type { CashflowItem, SimulationModule } from '../types'
import { isSameMonth } from './utils'

export const createEventModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const events = snapshot.scenario.strategies.events
  return {
    id: 'events',
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
      return cashflows
    },
  }
}
