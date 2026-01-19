import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import { buildSsaEstimate } from '../ssa'
import type { CashflowItem, SimulationModule } from '../types'
import { isWithinRange, monthsBetween } from './utils'

export const createSocialSecurityModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const scenario = snapshot.scenario
  const activeStrategyIds = new Set(scenario.personStrategyIds)
  const activePersonStrategies = snapshot.personStrategies.filter((strategy) =>
    activeStrategyIds.has(strategy.id),
  )
  const peopleById = new Map(snapshot.people.map((person) => [person.id, person]))
  const socialById = new Map(
    snapshot.socialSecurityStrategies.map((strategy) => [strategy.id, strategy]),
  )
  const earningsByPerson = snapshot.socialSecurityEarnings.reduce<
    Map<string, typeof snapshot.socialSecurityEarnings>
  >((acc, record) => {
    const list = acc.get(record.personId) ?? []
    list.push(record)
    acc.set(record.personId, list)
    return acc
  }, new Map())
  const spendingItems = snapshot.spendingLineItems.filter(
    (item) => item.spendingStrategyId === scenario.spendingStrategyId,
  )
  const explain = createExplainTracker()

  const benefits = activePersonStrategies
    .map((strategy) => {
      const person = peopleById.get(strategy.personId)
      const socialStrategy = socialById.get(strategy.socialSecurityStrategyId)
      if (!person || !socialStrategy) {
        return null
      }
      const earnings = earningsByPerson.get(person.id) ?? []
      const futureWorkPeriods = snapshot.futureWorkPeriods.filter(
        (period) => period.futureWorkStrategyId === strategy.futureWorkStrategyId,
      )
      const estimate = buildSsaEstimate({
        person,
        socialStrategy,
        scenario,
        earnings,
        futureWorkPeriods,
        spendingLineItems: spendingItems,
        wageIndex: snapshot.ssaWageIndex,
        bendPoints: snapshot.ssaBendPoints,
        retirementAdjustments: snapshot.ssaRetirementAdjustments,
      })
      if (!estimate) {
        return null
      }
      return {
        person,
        socialStrategy,
        claimDate: socialStrategy.startDate,
        claimYear: estimate.claimYear,
        monthlyBenefit: estimate.monthlyBenefit,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  const cpiRate = scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0

  return {
    id: 'social-security',
    explain,
    getCashflowSeries: ({ cashflows }) => {
      const totalCash = cashflows.reduce((sum, flow) => sum + flow.cash, 0)
      if (totalCash === 0) {
        return []
      }
      return [
        {
          key: 'social-security:income',
          label: 'Social Security - income',
          value: totalCash,
        },
      ]
    },
    getCashflows: (_state, context) => {
      const cashflows: CashflowItem[] = []
      benefits.forEach((benefit) => {
        if (!isWithinRange(context.dateIso, benefit.claimDate, null)) {
          return
        }
        const months = monthsBetween(benefit.claimDate, context.dateIso)
        const factor = Math.pow(1 + cpiRate, months / 12)
        const monthlyBenefit = benefit.monthlyBenefit * factor
        if (monthlyBenefit <= 0) {
          return
        }
        cashflows.push({
          id: `${benefit.person.id}-${context.monthIndex}-ssa`,
          label: `${benefit.person.name} Social Security`,
          category: 'social_security',
          cash: monthlyBenefit,
          ordinaryIncome: monthlyBenefit,
        })
      })
      const totalBenefits = cashflows.reduce((sum, flow) => sum + flow.cash, 0)
      explain.addInput('Strategy count', snapshot.socialSecurityStrategies.length)
      explain.addInput('CPI rate', cpiRate)
      explain.addCheckpoint('Benefit count', cashflows.length)
      explain.addCheckpoint('Benefit total', totalBenefits)
      return cashflows
    },
  }
}
