import type { FutureWorkPeriod, SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import type {
  ActionIntent,
  CashflowItem,
  CashflowSeriesEntry,
  SimulationContext,
  SimulationModule,
} from '../types'
import { inflateAmount, isWithinRange } from './utils'

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
  const holdingTaxTypeById = new Map(
    snapshot.investmentAccountHoldings.map((holding) => [holding.id, holding.taxType]),
  )
  const contributionLimits = snapshot.contributionLimits ?? []
  const cpiRate = scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
  const explain = createExplainTracker()

  const getActivePeriods = (context: SimulationContext): FutureWorkPeriod[] =>
    periods.filter((period) => isWithinRange(context.dateIso, period.startDate, period.endDate))

  const getContributionLimit = (
    type: (typeof contributionLimits)[number]['type'],
    context: SimulationContext,
  ) => {
    if (contributionLimits.length === 0) {
      return 0
    }
    const year = context.date.getFullYear()
    const sorted = [...contributionLimits]
      .filter((limit) => limit.type === type)
      .sort((a, b) => b.year - a.year)
    if (sorted.length === 0) {
      return 0
    }
    const base = sorted.find((limit) => limit.year <= year) ?? sorted[0]
    const baseIso = `${base.year}-01-01`
    return inflateAmount(base.amount, baseIso, context.dateIso, cpiRate)
  }

  const getInflatedAnnual = (
    amount: number,
    period: FutureWorkPeriod,
    context: SimulationContext,
  ) => {
    const startIso = period.startDate ?? context.settings.startDate
    return inflateAmount(amount, startIso, context.dateIso, cpiRate)
  }

  const getEmployee401kAnnual = (period: FutureWorkPeriod, context: SimulationContext) => {
    const type = period['401kContributionType']
    const maxLimit = getContributionLimit('401k', context)
    let annual = 0
    if (type === 'max') {
      annual = maxLimit
    } else if (type === 'fixed') {
      annual = getInflatedAnnual(period['401kContributionAnnual'], period, context)
    } else if (type === 'percent') {
      annual =
        getInflatedAnnual(period.salary, period, context) * period['401kContributionPct']
    }
    return annual
  }

  const getEmployeeHsaAnnual = (period: FutureWorkPeriod, context: SimulationContext) => {
    const maxLimit = getContributionLimit('hsa', context)
    return period['hsaUseMaxLimit']
      ? maxLimit
      : getInflatedAnnual(period['hsaContributionAnnual'], period, context)
  }

  return {
    id: 'future-work',
    explain,
    getCashflowSeries: ({ cashflows, actions, holdingTaxTypeById }) => {
      let income = 0
      const contributionsByTax: Record<
        'taxable' | 'traditional' | 'roth' | 'hsa',
        number
      > = {
        taxable: 0,
        traditional: 0,
        roth: 0,
        hsa: 0,
      }
      let hsaDeposits = 0
      cashflows.forEach((flow) => {
        income += flow.cash
      })

      actions.forEach((action) => {
        if (action.kind !== 'deposit') {
          return
        }
        const label = (action.label ?? '').toLowerCase()
        const resolved = action.resolvedAmount ?? action.amount
        if (label.includes('401k')) {
          const taxType = action.targetHoldingId
            ? holdingTaxTypeById.get(action.targetHoldingId)
            : undefined
          const bucket =
            taxType === 'taxable' ||
            taxType === 'traditional' ||
            taxType === 'roth' ||
            taxType === 'hsa'
              ? taxType
              : 'traditional'
          contributionsByTax[bucket] += resolved
        } else if (label.includes('hsa')) {
          hsaDeposits += resolved
        }
      })

      const entries: CashflowSeriesEntry[] = []
      if (income !== 0) {
        entries.push({
          key: 'future-work:income',
          label: 'Work - income',
          value: income,
          bucket: 'cash',
        })
      }
      Object.entries(contributionsByTax).forEach(([bucket, value]) => {
        if (!value) {
          return
        }
        entries.push({
          key: `future-work:401k:${bucket}`,
          label: `Work - 401k (${bucket})`,
          value,
          bucket: bucket as 'taxable' | 'traditional' | 'roth' | 'hsa',
        })
      })
      if (hsaDeposits !== 0) {
        entries.push({
          key: 'future-work:hsa',
          label: 'Work - hsa',
          value: hsaDeposits,
          bucket: 'hsa',
        })
      }
      return entries
    },
    getCashflows: (_state, context) => {
      const cashflows: CashflowItem[] = []
      const activePeriods = getActivePeriods(context)
      activePeriods.forEach((period) => {
        const monthlyIncome =
          getInflatedAnnual(period.salary, period, context) / 12 +
          getInflatedAnnual(period.bonus, period, context) / 12
        if (monthlyIncome > 0) {
          cashflows.push({
            id: `${period.id}-${context.monthIndex}-income`,
            label: period.name,
            category: 'work',
            cash: monthlyIncome,
            ordinaryIncome: monthlyIncome,
          })
        }

        const employeeAnnual401k = getEmployee401kAnnual(period, context)
        const employeeMonthly401k = employeeAnnual401k / 12
        const employeeHoldingValid = holdingIds.has(period['401kInvestmentAccountHoldingId'])
        if (employeeMonthly401k > 0 && employeeHoldingValid) {
          const employeeTaxType = holdingTaxTypeById.get(period['401kInvestmentAccountHoldingId'])
          const deductions = employeeTaxType === 'traditional' ? employeeMonthly401k : 0
          cashflows.push({
            id: `${period.id}-${context.monthIndex}-deferral`,
            label: `${period.name} 401k deferral`,
            category: 'work',
            cash: -employeeMonthly401k,
            deductions,
          })
        }

        const employeeAnnualHsa = getEmployeeHsaAnnual(period, context)
        const employeeMonthlyHsa = employeeAnnualHsa / 12
        const hsaHoldingId = period['hsaInvestmentAccountHoldingId']
        const hsaHoldingValid = hsaHoldingId ? holdingIds.has(hsaHoldingId) : false
        if (employeeMonthlyHsa > 0 && hsaHoldingValid) {
          cashflows.push({
            id: `${period.id}-${context.monthIndex}-hsa`,
            label: `${period.name} HSA contribution`,
            category: 'work',
            cash: -employeeMonthlyHsa,
            deductions: employeeMonthlyHsa,
          })
        }
      })
      const max401k = getContributionLimit('401k', context)
      const maxHsa = getContributionLimit('hsa', context)
      const monthlyIncomeTotal = activePeriods.reduce(
        (sum, period) =>
          sum +
          getInflatedAnnual(period.salary, period, context) / 12 +
          getInflatedAnnual(period.bonus, period, context) / 12,
        0,
      )
      const employeeMonthlyTotal = activePeriods.reduce(
        (sum, period) => sum + getEmployee401kAnnual(period, context) / 12,
        0,
      )
      const employerMonthlyTotal = activePeriods.reduce((sum, period) => {
        const employeeAnnual = getEmployee401kAnnual(period, context)
        const matchBase = Math.min(
          employeeAnnual * period['401kMatchRatio'],
          getInflatedAnnual(period.salary, period, context) * period['401kMatchPctCap'],
        )
        return sum + matchBase / 12
      }, 0)
      const hsaEmployeeMonthlyTotal = activePeriods.reduce(
        (sum, period) => sum + getEmployeeHsaAnnual(period, context) / 12,
        0,
      )
      const hsaEmployerMonthlyTotal = activePeriods.reduce(
        (sum, period) => sum + getInflatedAnnual(period['hsaEmployerContributionAnnual'], period, context) / 12,
        0,
      )
      explain.addInput('Periods', periods.length)
      explain.addInput('Active periods', activePeriods.length)
      explain.addInput('Max 401k', max401k)
      explain.addInput('Max HSA', maxHsa)
      explain.addCheckpoint('Monthly income', monthlyIncomeTotal)
      explain.addCheckpoint('Employee 401k', employeeMonthlyTotal)
      explain.addCheckpoint('Employer match', employerMonthlyTotal)
      explain.addCheckpoint('Employee HSA', hsaEmployeeMonthlyTotal)
      explain.addCheckpoint('Employer HSA', hsaEmployerMonthlyTotal)
      return cashflows
    },
    getActionIntents: (_state, context) => {
      const intents: ActionIntent[] = []
      getActivePeriods(context).forEach((period, index) => {
        const employeeHoldingId = period['401kInvestmentAccountHoldingId']
        const employerHoldingId =
          period['401kEmployerMatchHoldingId'] || period['401kInvestmentAccountHoldingId']
        const employeeHoldingValid = holdingIds.has(employeeHoldingId)
        const employerHoldingValid = holdingIds.has(employerHoldingId)
        const employeeAnnual401k = employeeHoldingValid
          ? getEmployee401kAnnual(period, context)
          : 0
        const employeeMonthly401k = employeeAnnual401k / 12
        const inflatedSalary = getInflatedAnnual(period.salary, period, context)
        const matchBase = Math.min(
          employeeAnnual401k * period['401kMatchRatio'],
          inflatedSalary * period['401kMatchPctCap'],
        )
        const employerAnnual401k = matchBase
        const employerMonthly401k = employerAnnual401k / 12

        if (employeeMonthly401k > 0 && employeeHoldingValid) {
          intents.push({
            id: `${period.id}-${context.monthIndex}-401k-employee`,
            kind: 'deposit',
            amount: employeeMonthly401k,
            targetHoldingId: employeeHoldingId,
            fromCash: false,
            priority: 10 + index,
            label: `${period.name} 401k deferral`,
          })
        }

        if (employerMonthly401k > 0 && employerHoldingValid) {
          intents.push({
            id: `${period.id}-${context.monthIndex}-401k-employer`,
            kind: 'deposit',
            amount: employerMonthly401k,
            targetHoldingId: employerHoldingId,
            fromCash: false,
            priority: 20 + index,
            label: `${period.name} 401k match`,
          })
        }

        const hsaHoldingId = period['hsaInvestmentAccountHoldingId']
        const hsaHoldingValid = hsaHoldingId ? holdingIds.has(hsaHoldingId) : false
        const employeeAnnualHsa = getEmployeeHsaAnnual(period, context)
        const employeeMonthlyHsa = employeeAnnualHsa / 12
        if (employeeMonthlyHsa > 0 && hsaHoldingValid) {
          intents.push({
            id: `${period.id}-${context.monthIndex}-hsa-employee`,
            kind: 'deposit',
            amount: employeeMonthlyHsa,
            targetHoldingId: hsaHoldingId ?? undefined,
            fromCash: false,
            priority: 30 + index,
            label: `${period.name} HSA contribution`,
          })
        }

        const employerAnnualHsa = getInflatedAnnual(
          period['hsaEmployerContributionAnnual'],
          period,
          context,
        )
        const employerMonthlyHsa = employerAnnualHsa / 12
        if (employerMonthlyHsa > 0 && hsaHoldingValid) {
          intents.push({
            id: `${period.id}-${context.monthIndex}-hsa-employer`,
            kind: 'deposit',
            amount: employerMonthlyHsa,
            targetHoldingId: hsaHoldingId ?? undefined,
            fromCash: false,
            priority: 40 + index,
            label: `${period.name} HSA credit`,
          })
        }
      })
      return intents
    },
  }
}
