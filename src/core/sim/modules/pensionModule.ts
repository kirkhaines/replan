import type { SimulationSnapshot } from '../../models'
import type { CashflowItem, SimulationModule } from '../types'
import { inflateAmount, isWithinRange } from './utils'

export const createPensionModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const scenario = snapshot.scenario
  const pensions = scenario.strategies.pensions
  return {
    id: 'pensions',
    getCashflows: (_state, context) => {
      const cashflows: CashflowItem[] = []
      pensions.forEach((pension) => {
        if (!isWithinRange(context.dateIso, pension.startDate, pension.endDate)) {
          return
        }
        const inflationRate =
          scenario.strategies.returnModel.inflationAssumptions[pension.inflationType] ?? 0
        const amount = inflateAmount(
          pension.monthlyAmount,
          pension.startDate,
          context.dateIso,
          inflationRate,
        )
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
      return cashflows
    },
  }
}
