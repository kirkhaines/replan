import type { FutureWorkPeriod, SimulationSnapshot } from '../models'
import { buildSsaEstimate } from './ssa'
import type {
  ActionIntent,
  CashflowItem,
  SimulationContext,
  SimulationModule,
  SimulationSettings,
} from './types'

const toMonthlyRate = (annualRate: number) => Math.pow(1 + annualRate, 1 / 12) - 1

const parseIsoDate = (value?: string | null) => {
  if (!value) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

const monthsBetween = (startIso: string, endIso: string) => {
  const start = parseIsoDate(startIso)
  const end = parseIsoDate(endIso)
  if (!start || !end) {
    return 0
  }
  let months = (end.getFullYear() - start.getFullYear()) * 12
  months += end.getMonth() - start.getMonth()
  if (end.getDate() < start.getDate()) {
    months -= 1
  }
  return Math.max(0, months)
}

const isWithinRange = (dateIso: string, start?: string | null, end?: string | null) => {
  const date = parseIsoDate(dateIso)
  if (!date) {
    return false
  }
  const startDate = parseIsoDate(start ?? null)
  const endDate = parseIsoDate(end ?? null)
  if (startDate && date < startDate) {
    return false
  }
  if (endDate && date > endDate) {
    return false
  }
  return true
}

const inflateAmount = (amount: number, startIso: string | null, currentIso: string, rate: number) => {
  if (!startIso) {
    return amount
  }
  const months = monthsBetween(startIso, currentIso)
  const factor = Math.pow(1 + rate, months / 12)
  return amount * factor
}

const createSpendingModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const scenario = snapshot.scenario
  const spendingItems = snapshot.spendingLineItems.filter(
    (item) => item.spendingStrategyId === scenario.spendingStrategyId,
  )

  return {
    id: 'spending',
    getCashflows: (_state, context) => {
      const cashflows: CashflowItem[] = []
      spendingItems.forEach((item) => {
        if (!isWithinRange(context.dateIso, item.startDate, item.endDate)) {
          return
        }
        const inflationRate = scenario.inflationAssumptions[item.inflationType] ?? 0
        const startIso = item.startDate ? item.startDate : null
        const needAmount = inflateAmount(item.needAmount, startIso, context.dateIso, inflationRate)
        const wantAmount = inflateAmount(item.wantAmount, startIso, context.dateIso, inflationRate)
        const deductionAmount = item.isPreTax || item.isCharitable ? 1 : 0

        if (needAmount > 0) {
          cashflows.push({
            id: `${item.id}-${context.monthIndex}-need`,
            label: item.name,
            category: 'spending_need',
            cash: -needAmount,
            deductions: deductionAmount ? needAmount : undefined,
          })
        }
        if (wantAmount > 0) {
          cashflows.push({
            id: `${item.id}-${context.monthIndex}-want`,
            label: item.name,
            category: 'spending_want',
            cash: -wantAmount,
            deductions: deductionAmount ? wantAmount : undefined,
          })
        }
      })
      return cashflows
    },
  }
}

const createWorkModule = (snapshot: SimulationSnapshot): SimulationModule => {
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
          priority: 10 + index,
          label: `${period.name} 401k match`,
        })
      })
      return intents
    },
  }
}

const createSocialSecurityModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const scenario = snapshot.scenario
  const activeStrategyIds = new Set(scenario.personStrategyIds)
  const activePersonStrategies = snapshot.personStrategies.filter((strategy) =>
    activeStrategyIds.has(strategy.id),
  )
  const peopleById = new Map(snapshot.people.map((person) => [person.id, person]))
  const socialById = new Map(
    snapshot.socialSecurityStrategies.map((strategy) => [strategy.id, strategy]),
  )
  const earningsByPerson = snapshot.socialSecurityEarnings.reduce<Map<string, typeof snapshot.socialSecurityEarnings>>(
    (acc, record) => {
      const list = acc.get(record.personId) ?? []
      list.push(record)
      acc.set(record.personId, list)
      return acc
    },
    new Map(),
  )
  const spendingItems = snapshot.spendingLineItems.filter(
    (item) => item.spendingStrategyId === scenario.spendingStrategyId,
  )

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

  const cpiRate = scenario.inflationAssumptions.cpi ?? 0

  return {
    id: 'social-security',
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
      return cashflows
    },
  }
}

const createFundingModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const strategy = snapshot.scenario.fundingStrategyType

  const getOrder = () => {
    if (strategy === 'tax_deferred_then_tax_free') {
      return ['traditional', 'taxable', 'roth', 'hsa'] as const
    }
    if (strategy === 'roth_ladder_then_taxable') {
      return ['taxable', 'traditional', 'roth', 'hsa'] as const
    }
    return [] as const
  }

  return {
    id: 'funding-core',
    getActionIntents: (state) => {
      const cashBalance = state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)
      if (cashBalance >= 0) {
        return []
      }
      const deficit = Math.abs(cashBalance)
      if (strategy === 'pro_rata') {
        return [
          {
            id: 'funding-cash-deficit',
            kind: 'withdraw',
            amount: deficit,
            priority: 100,
            label: 'Cover cash deficit',
          },
        ]
      }

      const order = getOrder()
      const intents: ActionIntent[] = []
      let remaining = deficit
      let priority = 100

      order.forEach((taxType) => {
        if (remaining <= 0) {
          return
        }
        const holdings = state.holdings
          .filter((holding) => holding.taxType === taxType)
          .sort((a, b) => b.balance - a.balance)
        holdings.forEach((holding) => {
          if (remaining <= 0) {
            return
          }
          const amount = Math.min(remaining, holding.balance)
          if (amount <= 0) {
            return
          }
          intents.push({
            id: `funding-${holding.id}`,
            kind: 'withdraw',
            amount,
            sourceHoldingId: holding.id,
            priority,
            label: 'Cover cash deficit',
          })
          priority += 1
          remaining -= amount
        })
      })

      if (intents.length === 0) {
        intents.push({
          id: 'funding-cash-deficit',
          kind: 'withdraw',
          amount: deficit,
          priority: 100,
          label: 'Cover cash deficit',
        })
      }

      return intents
    },
  }
}

const createReturnModule = (): SimulationModule => ({
  id: 'returns-core',
  onEndOfMonth: (state) => {
    state.cashAccounts.forEach((account) => {
      const rate = toMonthlyRate(account.interestRate)
      account.balance *= 1 + rate
    })
    state.holdings.forEach((holding) => {
      const rate = toMonthlyRate(holding.returnRate)
      holding.balance *= 1 + rate
    })
  },
})

export const createSimulationModules = (
  snapshot: SimulationSnapshot,
  settings: SimulationSettings,
): SimulationModule[] => {
  void settings
  return [
    createSpendingModule(snapshot),
    createWorkModule(snapshot),
    createSocialSecurityModule(snapshot),
    createFundingModule(snapshot),
    createReturnModule(),
  ]
}
