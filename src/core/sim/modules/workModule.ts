import type { FutureWorkPeriod, SimulationSnapshot } from '../../models'
import type { ActionIntent, CashflowItem, SimulationContext, SimulationModule } from '../types'
import { isWithinRange } from './utils'

export const createWorkModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const scenario = snapshot.scenario
  const activeStrategyIds = new Set(scenario.personStrategyIds)
  const activePersonStrategies = snapshot.personStrategies.filter((strategy) =>
    activeStrategyIds.has(strategy.id),
  )
  const futureWorkStrategyIds = new Set(
    activePersonStrategies.map((strategy) => strategy.futureWorkStrategyId),
  )
  const periods = snapshot.futureWorkPeriods.filter((period) =>
    futureWorkStrategyIds.has(period.futureWorkStrategyId),
  )
  const holdingIds = new Set(snapshot.investmentAccountHoldings.map((holding) => holding.id))

  const getActivePeriods = (context: SimulationContext): FutureWorkPeriod[] =>
    periods.filter((period) => isWithinRange(context.dateIso, period.startDate, period.endDate))

  const getMonthlyContribution = (period: FutureWorkPeriod) => {
    // Assume employee defers enough to earn the full employer match.
    const employeeMonthly = (period.salary * period['401kMatchPctCap']) / 12
    const employerMonthly = employeeMonthly * period['401kMatchRatio']
    return { employeeMonthly, employerMonthly }
  }

  return {
    id: 'future-work',
    getCashflows: (_state, context) => {
      const cashflows: CashflowItem[] = []
      getActivePeriods(context).forEach((period) => {
        const monthlyIncome = period.salary / 12 + period.bonus / 12
        if (monthlyIncome > 0) {
          cashflows.push({
            id: `${period.id}-${context.monthIndex}-income`,
            label: period.name,
            category: 'work',
            cash: monthlyIncome,
            ordinaryIncome: monthlyIncome,
          })
        }

        const { employeeMonthly } = getMonthlyContribution(period)
        if (employeeMonthly > 0) {
          cashflows.push({
            id: `${period.id}-${context.monthIndex}-deferral`,
            label: `${period.name} 401k deferral`,
            category: 'work',
            cash: -employeeMonthly,
            deductions: employeeMonthly,
          })
        }
      })
      return cashflows
    },
    getActionIntents: (_state, context) => {
      const intents: ActionIntent[] = []
      getActivePeriods(context).forEach((period, index) => {
        const { employeeMonthly, employerMonthly } = getMonthlyContribution(period)
        const totalContribution = employeeMonthly + employerMonthly
        if (totalContribution <= 0) {
          return
        }
        if (!holdingIds.has(period['401kInvestmentAccountHoldingId'])) {
          return
        }
        intents.push({
          id: `${period.id}-${context.monthIndex}-contrib`,
          kind: 'deposit',
          amount: totalContribution,
          targetHoldingId: period['401kInvestmentAccountHoldingId'],
          fromCash: false,
          priority: 10 + index,
          label: `${period.name} 401k match`,
        })
      })
      return intents
    },
  }
}
