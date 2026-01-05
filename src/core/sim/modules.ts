import type { FutureWorkPeriod, SimulationSnapshot } from '../models'
import { createSeededRandom, hashStringToSeed, randomNormal } from './random'
import { buildSsaEstimate } from './ssa'
import { computeIrmaaSurcharge, computeTax, selectIrmaaTable, selectTaxPolicy } from './tax'
import type {
  ActionIntent,
  CashflowItem,
  SimulationContext,
  SimulationModule,
  SimulationSettings,
  SimHolding,
  SimulationState,
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

const isSameMonth = (dateIso: string, targetIso: string) => {
  const date = parseIsoDate(dateIso)
  const target = parseIsoDate(targetIso)
  if (!date || !target) {
    return false
  }
  return (
    date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth()
  )
}

const inflateAmount = (amount: number, startIso: string | null, currentIso: string, rate: number) => {
  if (!startIso) {
    return amount
  }
  const months = monthsBetween(startIso, currentIso)
  const factor = Math.pow(1 + rate, months / 12)
  return amount * factor
}

const sumMonthlySpending = (
  items: SimulationSnapshot['spendingLineItems'],
  scenario: SimulationSnapshot['scenario'],
  dateIso: string,
) =>
  items.reduce((total, item) => {
    if (!isWithinRange(dateIso, item.startDate, item.endDate)) {
      return total
    }
    const inflationRate = scenario.inflationAssumptions[item.inflationType] ?? 0
    const startIso = item.startDate ? item.startDate : null
    const monthly =
      inflateAmount(item.needAmount, startIso, dateIso, inflationRate) +
      inflateAmount(item.wantAmount, startIso, dateIso, inflationRate)
    return total + monthly
  }, 0)

type AssetClass = 'equity' | 'bonds' | 'cash' | 'realEstate' | 'other'

const toAssetClass = (holding: SimHolding): AssetClass => {
  switch (holding.holdingType) {
    case 'bonds':
      return 'bonds'
    case 'cash':
      return 'cash'
    case 'real_estate':
      return 'realEstate'
    case 'other':
      return 'other'
    default:
      return 'equity'
  }
}

const taxAwareSellPriority: Record<SimHolding['taxType'], number> = {
  traditional: 0,
  hsa: 1,
  roth: 2,
  taxable: 3,
}

const getHoldingGain = (holding: SimHolding) => holding.balance - holding.contributionBasis

const interpolateTargets = (
  targets: SimulationSnapshot['scenario']['strategies']['glidepath']['targets'],
  key: number,
) => {
  const sorted = [...targets].sort((a, b) => a.age - b.age)
  if (sorted.length === 0) {
    return null
  }
  if (key <= sorted[0].age) {
    return sorted[0]
  }
  if (key >= sorted[sorted.length - 1].age) {
    return sorted[sorted.length - 1]
  }
  const upperIndex = sorted.findIndex((target) => target.age >= key)
  const lower = sorted[Math.max(0, upperIndex - 1)]
  const upper = sorted[upperIndex]
  const span = Math.max(1, upper.age - lower.age)
  const ratio = (key - lower.age) / span
  return {
    age: key,
    equity: lower.equity + (upper.equity - lower.equity) * ratio,
    bonds: lower.bonds + (upper.bonds - lower.bonds) * ratio,
    cash: lower.cash + (upper.cash - lower.cash) * ratio,
    realEstate: lower.realEstate + (upper.realEstate - lower.realEstate) * ratio,
    other: lower.other + (upper.other - lower.other) * ratio,
  }
}

const createSpendingModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const scenario = snapshot.scenario
  const spendingItems = snapshot.spendingLineItems.filter(
    (item) => item.spendingStrategyId === scenario.spendingStrategyId,
  )

  return {
    id: 'spending',
    getCashflows: (state, context) => {
      const cashflows: CashflowItem[] = []
      const guardrailPct = scenario.strategies.withdrawal.guardrailPct
      const totalBalance =
        state.cashAccounts.reduce((sum, account) => sum + account.balance, 0) +
        state.holdings.reduce((sum, holding) => sum + holding.balance, 0)
      const guardrailActive =
        guardrailPct > 0 && totalBalance < state.initialBalance * (1 - guardrailPct)
      const guardrailFactor = guardrailActive ? 1 - guardrailPct : 1
      spendingItems.forEach((item) => {
        if (!isWithinRange(context.dateIso, item.startDate, item.endDate)) {
          return
        }
        const inflationRate = scenario.inflationAssumptions[item.inflationType] ?? 0
        const startIso = item.startDate ? item.startDate : null
        const needAmount = inflateAmount(item.needAmount, startIso, context.dateIso, inflationRate)
        const wantAmount =
          inflateAmount(item.wantAmount, startIso, context.dateIso, inflationRate) *
          guardrailFactor
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
          fromCash: false,
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

const createEventModule = (snapshot: SimulationSnapshot): SimulationModule => {
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

const createPensionModule = (snapshot: SimulationSnapshot): SimulationModule => {
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
        const inflationRate = scenario.inflationAssumptions[pension.inflationType] ?? 0
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

const createCharitableModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const strategy = snapshot.scenario.strategies.charitable

  return {
    id: 'charitable',
    getCashflows: (_state, context) => {
      if (strategy.annualGiving <= 0) {
        return []
      }
      if (strategy.startAge > 0 && context.age < strategy.startAge) {
        return []
      }
      if (strategy.endAge > 0 && context.age > strategy.endAge) {
        return []
      }
      const monthlyGiving = strategy.annualGiving / 12
      const qcdAnnual = strategy.useQcd
        ? strategy.qcdAnnualAmount > 0
          ? Math.min(strategy.annualGiving, strategy.qcdAnnualAmount)
          : strategy.annualGiving
        : 0
      const qcdMonthly = strategy.useQcd ? qcdAnnual / 12 : 0
      const deduction =
        strategy.useQcd && context.age >= 70.5
          ? Math.max(0, monthlyGiving - qcdMonthly)
          : monthlyGiving
      return [
        {
          id: `charitable-${context.monthIndex}`,
          label: 'Charitable giving',
          category: 'charitable',
          cash: -monthlyGiving,
          deductions: deduction > 0 ? deduction : undefined,
        },
      ]
    },
    getActionIntents: (state, context) => {
      if (!strategy.useQcd || context.age < 70.5) {
        return []
      }
      const qcdAnnual =
        strategy.qcdAnnualAmount > 0
          ? Math.min(strategy.annualGiving, strategy.qcdAnnualAmount)
          : strategy.annualGiving
      if (qcdAnnual <= 0) {
        return []
      }
      const monthlyQcd = qcdAnnual / 12
      const sourceHolding = [...state.holdings]
        .filter((holding) => holding.taxType === 'traditional')
        .sort((a, b) => b.balance - a.balance)[0]
      if (!sourceHolding) {
        return []
      }
      return [
        {
          id: `qcd-${context.monthIndex}`,
          kind: 'withdraw',
          amount: monthlyQcd,
          sourceHoldingId: sourceHolding.id,
          taxTreatment: 'tax_exempt',
          priority: 40,
          label: 'QCD',
        },
      ]
    },
  }
}

const createHealthcareModule = (
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
      const inflationRate = scenario.inflationAssumptions[strategy.inflationType] ?? 0
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

const createCashBufferModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const scenario = snapshot.scenario
  const strategy = scenario.strategies.cashBuffer
  const withdrawal = scenario.strategies.withdrawal
  const early = scenario.strategies.earlyRetirement
  const spendingItems = snapshot.spendingLineItems.filter(
    (item) => item.spendingStrategyId === scenario.spendingStrategyId,
  )

  const getWithdrawOrder = () => {
    if (strategy.refillPriority === 'tax_deferred_first') {
      return ['traditional', 'taxable', 'roth', 'hsa'] as const
    }
    if (strategy.refillPriority === 'taxable_first') {
      return ['taxable', 'traditional', 'roth', 'hsa'] as const
    }
    return [] as const
  }

  return {
    id: 'cash-buffer',
    getActionIntents: (state, context) => {
      const monthlySpending = sumMonthlySpending(spendingItems, scenario, context.dateIso)
      if (monthlySpending <= 0) {
        return []
      }
      const bridgeMonths = Math.max(0, early.bridgeCashYears) * 12
      const targetMonths = Math.max(strategy.targetMonths, bridgeMonths)
      const minMonths = withdrawal.useCashFirst ? strategy.minMonths : targetMonths
      const maxMonths = Math.max(strategy.maxMonths, targetMonths)
      const target = monthlySpending * targetMonths
      const min = monthlySpending * minMonths
      const max = monthlySpending * maxMonths
      const cashBalance = state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)

      if (cashBalance < min) {
        const needed = Math.max(0, target - cashBalance)
        if (strategy.refillPriority === 'pro_rata') {
          return [
            {
              id: `cash-buffer-${context.monthIndex}`,
              kind: 'withdraw',
              amount: needed,
              priority: 60,
              label: 'Refill cash buffer',
            },
          ]
        }
        const order = getWithdrawOrder()
        const intents: ActionIntent[] = []
        let remaining = needed
        let priority = 60
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
              id: `cash-buffer-${holding.id}`,
              kind: 'withdraw',
              amount,
              sourceHoldingId: holding.id,
              priority,
              label: 'Refill cash buffer',
            })
            priority += 1
            remaining -= amount
          })
        })
        return intents
      }

      if (cashBalance > max) {
        const excess = Math.max(0, cashBalance - target)
        const targetHolding = [...state.holdings].sort((a, b) => b.balance - a.balance)[0]
        if (!targetHolding) {
          return []
        }
        return [
          {
            id: `cash-buffer-invest-${context.monthIndex}`,
            kind: 'deposit',
            amount: excess,
            targetHoldingId: targetHolding.id,
            fromCash: true,
            priority: 70,
            label: 'Invest excess cash',
          },
        ]
      }

      return []
    },
  }
}

const createRebalancingModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const { glidepath, rebalancing } = snapshot.scenario.strategies

  const shouldRebalance = (context: SimulationContext) => {
    if (rebalancing.frequency === 'monthly') {
      return true
    }
    if (rebalancing.frequency === 'quarterly') {
      return context.monthIndex % 3 === 2
    }
    if (rebalancing.frequency === 'annual') {
      return context.isEndOfYear
    }
    return true
  }

  const sortHoldingsForSale = (holdings: SimHolding[]) => {
    const sorted = [...holdings]
    if (rebalancing.taxAware) {
      sorted.sort((a, b) => {
        const priority =
          taxAwareSellPriority[a.taxType] - taxAwareSellPriority[b.taxType]
        return priority !== 0 ? priority : b.balance - a.balance
      })
      return sorted
    }
    return sorted.sort((a, b) => b.balance - a.balance)
  }

  return {
    id: 'rebalancing',
    getActionIntents: (state, context) => {
      if (!shouldRebalance(context)) {
        return []
      }
      const key = glidepath.mode === 'year' ? context.yearIndex : context.age
      const target = interpolateTargets(glidepath.targets, key)
      if (!target) {
        return []
      }
      const availableCashRef = {
        value: rebalancing.useContributions
          ? state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)
          : 0,
      }
      let priority = 20
      const nextPriority = () => {
        const current = priority
        priority += 1
        return current
      }

      const targetWeights: Record<AssetClass, number> = {
        equity: target.equity,
        bonds: target.bonds,
        cash: target.cash,
        realEstate: target.realEstate,
        other: target.other,
      }

      const buildActionsForHoldings = (holdings: SimHolding[]): ActionIntent[] => {
        const total = holdings.reduce((sum, holding) => sum + holding.balance, 0)
        if (total <= 0) {
          return []
        }
        const totalsByClass: Record<AssetClass, number> = {
          equity: 0,
          bonds: 0,
          cash: 0,
          realEstate: 0,
          other: 0,
        }
        holdings.forEach((holding) => {
          totalsByClass[toAssetClass(holding)] += holding.balance
        })

        const driftExceeded = (Object.keys(targetWeights) as AssetClass[]).some((asset) => {
          const currentWeight = total > 0 ? totalsByClass[asset] / total : 0
          return Math.abs(currentWeight - targetWeights[asset]) > rebalancing.driftThreshold
        })
        if (rebalancing.frequency === 'threshold' && !driftExceeded) {
          return []
        }
        if (!driftExceeded && rebalancing.driftThreshold > 0) {
          return []
        }

        const actions: ActionIntent[] = []
        ;(Object.keys(targetWeights) as AssetClass[]).forEach((asset) => {
          const targetAmount = targetWeights[asset] * total
          const currentAmount = totalsByClass[asset]
          const delta = targetAmount - currentAmount
          if (Math.abs(delta) < rebalancing.minTradeAmount) {
            return
          }
          const assetHoldings = holdings.filter(
            (holding) => toAssetClass(holding) === asset,
          )
          if (assetHoldings.length === 0) {
            return
          }
          if (delta < 0) {
            let remaining = Math.abs(delta)
            sortHoldingsForSale(assetHoldings).forEach((holding) => {
              if (remaining <= 0) {
                return
              }
              const amount = Math.min(remaining, holding.balance)
              if (amount <= 0) {
                return
              }
              actions.push({
                id: `rebalance-sell-${holding.id}-${context.monthIndex}`,
                kind: 'withdraw',
                amount,
                sourceHoldingId: holding.id,
                priority: nextPriority(),
                label: 'Rebalance',
              })
              remaining -= amount
            })
          } else if (delta > 0) {
            const amount = rebalancing.useContributions
              ? Math.min(delta, Math.max(0, availableCashRef.value))
              : delta
            if (amount <= 0) {
              return
            }
            const targetHolding = assetHoldings.sort((a, b) => b.balance - a.balance)[0]
            if (!targetHolding) {
              return
            }
            actions.push({
              id: `rebalance-buy-${targetHolding.id}-${context.monthIndex}`,
              kind: 'deposit',
              amount,
              targetHoldingId: targetHolding.id,
              fromCash: true,
              priority: nextPriority(),
              label: 'Rebalance',
            })
            if (rebalancing.useContributions) {
              availableCashRef.value = Math.max(0, availableCashRef.value - amount)
            }
          }
        })
        return actions
      }

      if (glidepath.scope === 'per_account') {
        const actions: ActionIntent[] = []
        const holdingsByAccount = new Map<string, SimHolding[]>()
        state.holdings.forEach((holding) => {
          const list = holdingsByAccount.get(holding.investmentAccountId) ?? []
          list.push(holding)
          holdingsByAccount.set(holding.investmentAccountId, list)
        })
        holdingsByAccount.forEach((holdings) => {
          actions.push(...buildActionsForHoldings(holdings))
        })
        return actions
      }

      return buildActionsForHoldings(state.holdings)
    },
  }
}

const createConversionModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const { rothConversion, rothLadder, tax } = snapshot.scenario.strategies

  const isAgeInRange = (age: number, startAge: number, endAge: number) => {
    if (startAge > 0 && age < startAge) {
      return false
    }
    if (endAge > 0 && age > endAge) {
      return false
    }
    return true
  }

  return {
    id: 'conversions',
    getActionIntents: (state, context) => {
      if (!context.isStartOfYear) {
        return []
      }
      const age = context.age
      let conversionAmount = 0

      const ladderStartAge =
        rothLadder.startAge > 0
          ? Math.max(0, rothLadder.startAge - rothLadder.leadTimeYears)
          : 0
      const ladderEndAge =
        rothLadder.endAge > 0
          ? Math.max(0, rothLadder.endAge - rothLadder.leadTimeYears)
          : 0
      if (rothLadder.enabled && isAgeInRange(age, ladderStartAge, ladderEndAge)) {
        const ladderAmount =
          rothLadder.annualConversion > 0
            ? rothLadder.annualConversion
            : rothLadder.targetAfterTaxSpending
        conversionAmount += ladderAmount
      }

      if (rothConversion.enabled && isAgeInRange(age, rothConversion.startAge, rothConversion.endAge)) {
        let candidate = rothConversion.targetOrdinaryIncome
        if (rothConversion.respectIrmaa) {
          const table = selectIrmaaTable(
            snapshot.irmaaTables,
            context.date.getFullYear(),
            tax.filingStatus,
          )
          const baseTier = table?.tiers[0]?.maxMagi ?? 0
          const currentMagi =
            state.yearLedger.ordinaryIncome +
            state.yearLedger.capitalGains +
            state.yearLedger.taxExemptIncome
          if (baseTier > 0) {
            candidate = Math.min(candidate, Math.max(0, baseTier - currentMagi))
          }
        }
        if (rothConversion.minConversion > 0) {
          candidate = Math.max(candidate, rothConversion.minConversion)
        }
        if (rothConversion.maxConversion > 0) {
          candidate = Math.min(candidate, rothConversion.maxConversion)
        }
        conversionAmount += candidate
      }

      if (conversionAmount <= 0) {
        return []
      }

      const sourceHolding = state.holdings.find((holding) => holding.taxType === 'traditional')
      const targetHolding = state.holdings.find((holding) => holding.taxType === 'roth')
      if (!sourceHolding || !targetHolding) {
        return []
      }

      return [
        {
          id: `conversion-${context.yearIndex}`,
          kind: 'convert',
          amount: conversionAmount,
          sourceHoldingId: sourceHolding.id,
          targetHoldingId: targetHolding.id,
          priority: 40,
          label: 'Roth conversion',
        },
      ]
    },
  }
}

const createRmdModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const strategy = snapshot.scenario.strategies.rmd

  const computeRmd = (state: SimulationState, context: SimulationContext) => {
    if (!strategy.enabled || !context.isStartOfYear) {
      return null
    }
    if (context.age < strategy.startAge) {
      return null
    }
    const ageKey = Math.floor(context.age)
    const divisor =
      snapshot.rmdTable.find((entry) => entry.age === ageKey)?.divisor ??
      snapshot.rmdTable[snapshot.rmdTable.length - 1]?.divisor ??
      1
    const eligibleHoldings = state.holdings.filter((holding) =>
      strategy.accountTypes.includes(holding.taxType),
    )
    const totalBalance = eligibleHoldings.reduce((sum, holding) => sum + holding.balance, 0)
    if (totalBalance <= 0 || divisor <= 0) {
      return null
    }
    const totalRmd = totalBalance / divisor
    return { totalRmd, eligibleHoldings }
  }

  return {
    id: 'rmd',
    getCashflows: (state, context) => {
      const result = computeRmd(state, context)
      if (!result) {
        return []
      }
      if (strategy.withholdingRate <= 0) {
        return []
      }
      const withholding = result.totalRmd * strategy.withholdingRate
      if (withholding <= 0) {
        return []
      }
      return [
        {
          id: `rmd-withholding-${context.yearIndex}`,
          label: 'RMD withholding',
          category: 'tax',
          cash: -withholding,
        },
      ]
    },
    getActionIntents: (state, context) => {
      const result = computeRmd(state, context)
      if (!result) {
        return []
      }
      const { totalRmd, eligibleHoldings } = result
      let remaining = totalRmd
      const intents: ActionIntent[] = []
      let priority = 30
      eligibleHoldings
        .sort((a, b) => b.balance - a.balance)
        .forEach((holding) => {
          if (remaining <= 0) {
            return
          }
          const amount = Math.min(remaining, holding.balance)
          if (amount <= 0) {
            return
          }
          intents.push({
            id: `rmd-${holding.id}-${context.yearIndex}`,
            kind: 'withdraw',
            amount,
            sourceHoldingId: holding.id,
            priority,
            label: 'RMD',
          })
          priority += 1
          remaining -= amount
        })
      if (strategy.excessHandling !== 'spend') {
        const targetTaxType = strategy.excessHandling === 'roth' ? 'roth' : 'taxable'
        const targetHolding = state.holdings
          .filter((holding) => holding.taxType === targetTaxType)
          .sort((a, b) => b.balance - a.balance)[0]
        if (targetHolding) {
          intents.push({
            id: `rmd-reinvest-${targetHolding.id}-${context.yearIndex}`,
            kind: 'deposit',
            amount: totalRmd,
            targetHoldingId: targetHolding.id,
            fromCash: true,
            priority: 35,
            label: 'Reinvest RMD',
          })
        }
      }
      return intents
    },
  }
}

const createTaxModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const taxStrategy = snapshot.scenario.strategies.tax

  return {
    id: 'taxes',
    getCashflows: (state, context) => {
      if (!context.isEndOfYear) {
        return []
      }
      const policyYear = taxStrategy.policyYear || context.date.getFullYear()
      const policy = selectTaxPolicy(snapshot.taxPolicies, policyYear, taxStrategy.filingStatus)
      if (!policy) {
        return []
      }
      const taxResult = computeTax({
        ordinaryIncome: state.yearLedger.ordinaryIncome,
        capitalGains: state.yearLedger.capitalGains,
        deductions: state.yearLedger.deductions,
        taxExemptIncome: state.yearLedger.taxExemptIncome,
        stateTaxRate: taxStrategy.stateTaxRate,
        policy,
        useStandardDeduction: taxStrategy.useStandardDeduction,
        applyCapitalGainsRates: taxStrategy.applyCapitalGainsRates,
      })
      state.magiHistory[context.yearIndex] = taxResult.magi
      const totalTax = taxResult.taxOwed + state.yearLedger.penalties
      if (totalTax <= 0) {
        return []
      }
      return [
        {
          id: `tax-${context.yearIndex}`,
          label: 'Taxes',
          category: 'tax',
          cash: -totalTax,
        },
      ]
    },
  }
}

const createFundingModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const scenario = snapshot.scenario
  const withdrawal = scenario.strategies.withdrawal
  const early = scenario.strategies.earlyRetirement
  const taxableLot = scenario.strategies.taxableLot

  const fallbackOrder = () => {
    const strategy = scenario.fundingStrategyType
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
    getActionIntents: (state, context) => {
      const cashBalance = state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)
      if (cashBalance >= 0) {
        return []
      }
      const deficit = Math.abs(cashBalance)
      if (scenario.fundingStrategyType === 'pro_rata') {
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

      const baseOrder = withdrawal.order.length > 0 ? withdrawal.order : [...fallbackOrder()]
      const penalizedTypes = new Set<string>()
      if (context.age < 59.5) {
        if (!early.use72t) {
          penalizedTypes.add('traditional')
        }
        if (!early.useRothBasisFirst) {
          penalizedTypes.add('roth')
        }
      }
      let order = baseOrder
      if (withdrawal.avoidEarlyPenalty && context.age < 59.5) {
        order = [
          ...order.filter((type) => !penalizedTypes.has(type)),
          ...order.filter((type) => penalizedTypes.has(type)),
        ]
      }
      if (!early.allowPenalty && context.age < 59.5) {
        const withoutPenalty = order.filter((type) => !penalizedTypes.has(type))
        if (withoutPenalty.length > 0) {
          order = withoutPenalty
        }
      }
      const gainTarget = Math.max(
        withdrawal.taxableGainHarvestTarget,
        taxableLot.gainRealizationTarget,
      )
      const shouldHarvestGains = gainTarget > 0 && state.yearLedger.capitalGains < gainTarget
      if (shouldHarvestGains && order.includes('taxable')) {
        order = ['taxable', ...order.filter((type) => type !== 'taxable')]
      }
      const intents: ActionIntent[] = []
      let remaining = deficit
      let priority = 100

      order.forEach((taxType) => {
        if (remaining <= 0) {
          return
        }
        const holdings = state.holdings.filter((holding) => holding.taxType === taxType)
        const sortedHoldings =
          taxType === 'taxable'
            ? [...holdings].sort((a, b) => {
                const gainDelta = getHoldingGain(b) - getHoldingGain(a)
                if (shouldHarvestGains) {
                  return gainDelta
                }
                if (taxableLot.harvestLosses) {
                  return -gainDelta
                }
                return b.balance - a.balance
              })
            : [...holdings].sort((a, b) => b.balance - a.balance)
        sortedHoldings.forEach((holding) => {
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

const createReturnModule = (
  snapshot: SimulationSnapshot,
  settings: SimulationSettings,
): SimulationModule => {
  const returnModel = snapshot.scenario.strategies.returnModel
  const seed =
    returnModel.seed ?? hashStringToSeed(`${snapshot.scenario.id}:${settings.startDate}`)
  const random = createSeededRandom(seed)
  let cachedMonth = -1
  let cachedYear = -1
  let monthShocksByAsset: Partial<Record<AssetClass, number>> = {}
  let yearShocksByAsset: Partial<Record<AssetClass, number>> = {}
  let yearShocksByHolding: Record<string, number> = {}

  const nextNormalShock = () => randomNormal(random)

  const getShock = (holding: SimHolding, context: SimulationContext) => {
    if (returnModel.sequenceModel === 'regime') {
      if (context.yearIndex !== cachedYear) {
        cachedYear = context.yearIndex
        yearShocksByAsset = {}
        yearShocksByHolding = {}
      }
      if (returnModel.correlationModel === 'asset_class') {
        const asset = toAssetClass(holding)
        if (yearShocksByAsset[asset] === undefined) {
          yearShocksByAsset[asset] = nextNormalShock()
        }
        return yearShocksByAsset[asset] ?? 0
      }
      if (yearShocksByHolding[holding.id] === undefined) {
        yearShocksByHolding[holding.id] = nextNormalShock()
      }
      return yearShocksByHolding[holding.id]
    }

    if (returnModel.correlationModel === 'asset_class') {
      if (context.monthIndex !== cachedMonth) {
        cachedMonth = context.monthIndex
        monthShocksByAsset = {}
      }
      const asset = toAssetClass(holding)
      if (monthShocksByAsset[asset] === undefined) {
        monthShocksByAsset[asset] = nextNormalShock()
      }
      return monthShocksByAsset[asset] ?? 0
    }

    return nextNormalShock()
  }

  return {
    id: 'returns-core',
    onEndOfMonth: (state, context) => {
      state.cashAccounts.forEach((account) => {
        const baseRate =
          returnModel.cashYieldRate > 0 ? returnModel.cashYieldRate : account.interestRate
        const rate = toMonthlyRate(baseRate)
        account.balance *= 1 + rate
      })
      state.holdings.forEach((holding) => {
        const expected = toMonthlyRate(holding.returnRate)
        if (returnModel.mode === 'deterministic') {
          holding.balance *= 1 + expected
          return
        }
        const volatility =
          (holding.returnStdDev * returnModel.volatilityScale) / Math.sqrt(12)
        const shock = getShock(holding, context) * volatility
        const realized = Math.max(-0.95, expected + shock)
        holding.balance *= 1 + realized
      })
    },
  }
}

export const createSimulationModules = (
  snapshot: SimulationSnapshot,
  settings: SimulationSettings,
): SimulationModule[] => {
  return [
    createSpendingModule(snapshot),
    createEventModule(snapshot),
    createPensionModule(snapshot),
    createHealthcareModule(snapshot, settings),
    createCharitableModule(snapshot),
    createWorkModule(snapshot),
    createSocialSecurityModule(snapshot),
    createCashBufferModule(snapshot),
    createRebalancingModule(snapshot),
    createConversionModule(snapshot),
    createRmdModule(snapshot),
    createTaxModule(snapshot),
    createFundingModule(snapshot),
    createReturnModule(snapshot, settings),
  ]
}
