import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import { computeTax, selectIrmaaTable, selectTaxPolicy } from '../tax'
import type {
  ActionIntent,
  CashflowSeriesEntry,
  SimulationContext,
  SimulationModule,
  SimulationState,
} from '../types'
import { computeStateTax, selectStateTaxPolicy } from '../stateTaxes'
import { inflateAmount } from './utils'

export const createConversionModule = (snapshot: SimulationSnapshot): SimulationModule => {
  const { rothConversion, rothLadder, tax } = snapshot.scenario.strategies
  const withdrawal = snapshot.scenario.strategies.withdrawal
  const early = snapshot.scenario.strategies.earlyRetirement
  const cpiRate = snapshot.scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
  const explain = createExplainTracker()

  const sumSeasonedBasis = (entries: Array<{ date: string; amount: number }>, dateIso: string) => {
    const current = new Date(`${dateIso}T00:00:00Z`)
    if (Number.isNaN(current.getTime())) {
      return 0
    }
    return entries.reduce((sum, entry) => {
      const entryDate = new Date(`${entry.date}T00:00:00Z`)
      if (Number.isNaN(entryDate.getTime())) {
        return sum
      }
      let months =
        (current.getUTCFullYear() - entryDate.getUTCFullYear()) * 12 +
        (current.getUTCMonth() - entryDate.getUTCMonth())
      if (current.getUTCDate() < entryDate.getUTCDate()) {
        months -= 1
      }
      return months >= 60 ? sum + entry.amount : sum
    }, 0)
  }

  const buildWithdrawalOrder = (age: number) => {
    let order = withdrawal.order
    if (age < 59.5) {
      const penalizedTypes = new Set<string>()
      if (!early.use72t) {
        penalizedTypes.add('traditional')
      }
      penalizedTypes.add('roth')
      penalizedTypes.add('hsa')
      if (!early.allowPenalty) {
        const withoutPenalty = order.filter((type) => !penalizedTypes.has(type))
        if (withoutPenalty.length > 0) {
          order = withoutPenalty
        }
      } else if (withdrawal.avoidEarlyPenalty) {
        order = [
          ...order.filter((type) => !penalizedTypes.has(type)),
          ...order.filter((type) => penalizedTypes.has(type)),
        ]
      }
    }
    return order
  }

  const estimateTraditionalWithdrawalForAmount = (
    amount: number,
    state: SimulationState,
    context: SimulationContext,
  ) => {
    if (amount <= 0) {
      return 0
    }
    const order = buildWithdrawalOrder(context.age)
    const balancesByTax: Record<string, number> = {}
    const basisByHolding = new Map(
      state.holdings
        .filter((holding) => holding.taxType === 'roth')
        .map((holding) => [
          holding.id,
          sumSeasonedBasis(holding.contributionBasisEntries, context.dateIso),
        ]),
    )
    state.holdings.forEach((holding) => {
      balancesByTax[holding.taxType] =
        (balancesByTax[holding.taxType] ?? 0) + holding.balance
    })
    let remaining = amount
    let traditionalUsed = 0
    order.forEach((taxType) => {
      if (remaining <= 0) {
        return
      }
      if (taxType === 'roth_basis') {
        const basisTotal = state.holdings
          .filter((holding) => holding.taxType === 'roth')
          .reduce((sum, holding) => sum + (basisByHolding.get(holding.id) ?? 0), 0)
        const used = Math.min(remaining, basisTotal)
        remaining -= used
        return
      }
      const available = balancesByTax[taxType] ?? 0
      const used = Math.min(remaining, available)
      remaining -= used
      if (taxType === 'traditional') {
        traditionalUsed += used
      }
    })
    return traditionalUsed
  }

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
    explain,
    planYear: (state, context) => {
      if (!context.isStartOfYear) {
        return null
      }
      if (!rothConversion.enabled) {
        return { conversionAmount: 0 }
      }
      if (!isAgeInRange(context.age, rothConversion.startAge, rothConversion.endAge)) {
        return { conversionAmount: 0 }
      }

      const inflateFromStart = (amount: number) =>
        inflateAmount(amount, context.settings.startDate, context.dateIso, cpiRate)
      const inflateFromPolicyYear = (amount: number, year: number) =>
        inflateAmount(amount, `${year}-01-01`, context.dateIso, cpiRate)
      const policyYear = context.date.getFullYear()
      const policy = selectTaxPolicy(snapshot.taxPolicies, policyYear, tax.filingStatus)
      if (!policy) {
        return { conversionAmount: 0 }
      }
      const policyBaseYear = policy.year ?? policyYear

      let conversionCandidate = 0
      let irmaaHeadroom = Number.POSITIVE_INFINITY
      if (rothConversion.targetOrdinaryBracketRate > 0) {
        const bracket = policy.ordinaryBrackets.find(
          (entry) => entry.rate === rothConversion.targetOrdinaryBracketRate,
        )
        if (bracket?.upTo !== null && bracket?.upTo !== undefined) {
          const bracketCeiling = inflateFromPolicyYear(bracket.upTo, policyBaseYear)
          conversionCandidate = Math.max(0, bracketCeiling - state.yearLedger.ordinaryIncome)
        }
      }

      if (rothConversion.respectIrmaa) {
        const table = selectIrmaaTable(snapshot.irmaaTables, policyYear, tax.filingStatus)
        const baseTier = table?.tiers[0]?.maxMagi ?? 0
        if (baseTier > 0) {
          const tableBaseYear = table?.year ?? policyBaseYear
          const inflatedTier = inflateFromPolicyYear(baseTier, tableBaseYear)
          const currentMagi =
            state.yearLedger.ordinaryIncome +
            state.yearLedger.capitalGains +
            state.yearLedger.taxExemptIncome
          irmaaHeadroom = Math.max(0, inflatedTier - currentMagi)
          conversionCandidate = Math.min(conversionCandidate, irmaaHeadroom)
        }
      }

      if (rothConversion.minConversion > 0) {
        conversionCandidate = Math.max(
          conversionCandidate,
          inflateFromStart(rothConversion.minConversion),
        )
      }
      if (rothConversion.maxConversion > 0) {
        conversionCandidate = Math.min(
          conversionCandidate,
          inflateFromStart(rothConversion.maxConversion),
        )
      }

      if (conversionCandidate <= 0) {
        return { conversionAmount: 0 }
      }

      const baseTax = (() => {
        const result = computeTax({
          ordinaryIncome: state.yearLedger.ordinaryIncome,
          capitalGains: state.yearLedger.capitalGains,
          deductions: state.yearLedger.deductions,
          taxExemptIncome: state.yearLedger.taxExemptIncome,
          stateTaxRate: tax.stateCode === 'none' ? tax.stateTaxRate : 0,
          policy,
          useStandardDeduction: tax.useStandardDeduction,
          applyCapitalGainsRates: tax.applyCapitalGainsRates,
        })
        const statePolicy =
          tax.stateCode !== 'none'
            ? selectStateTaxPolicy(tax.stateCode, policyYear, tax.filingStatus)
            : null
        const stateTax = statePolicy
          ? computeStateTax({
              taxableIncome: result.taxableOrdinaryIncome + result.taxableCapitalGains,
              policy: statePolicy,
              useStandardDeduction: tax.useStandardDeduction,
            })
          : 0
        return result.taxOwed + stateTax
      })()

      let planned = conversionCandidate
      let traditionalTaxWithdrawal = 0
      for (let i = 0; i < 2; i += 1) {
        const projectedOrdinary =
          state.yearLedger.ordinaryIncome + planned + traditionalTaxWithdrawal
        const projected = computeTax({
          ordinaryIncome: projectedOrdinary,
          capitalGains: state.yearLedger.capitalGains,
          deductions: state.yearLedger.deductions,
          taxExemptIncome: state.yearLedger.taxExemptIncome,
          stateTaxRate: tax.stateCode === 'none' ? tax.stateTaxRate : 0,
          policy,
          useStandardDeduction: tax.useStandardDeduction,
          applyCapitalGainsRates: tax.applyCapitalGainsRates,
        })
        const statePolicy =
          tax.stateCode !== 'none'
            ? selectStateTaxPolicy(tax.stateCode, policyYear, tax.filingStatus)
            : null
        const stateTax = statePolicy
          ? computeStateTax({
              taxableIncome: projected.taxableOrdinaryIncome + projected.taxableCapitalGains,
              policy: statePolicy,
              useStandardDeduction: tax.useStandardDeduction,
            })
          : 0
        const totalTax = projected.taxOwed + stateTax
        const deltaTax = Math.max(0, totalTax - baseTax)
        const cashBalance = state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)
        const taxFromHoldings = Math.max(0, deltaTax - cashBalance)
        traditionalTaxWithdrawal = estimateTraditionalWithdrawalForAmount(
          taxFromHoldings,
          state,
          context,
        )
        planned = Math.max(0, conversionCandidate - traditionalTaxWithdrawal)
        if (Number.isFinite(irmaaHeadroom)) {
          planned = Math.min(planned, Math.max(0, irmaaHeadroom - traditionalTaxWithdrawal))
        }
        if (rothConversion.minConversion > 0) {
          planned = Math.max(planned, inflateFromStart(rothConversion.minConversion))
        }
        if (rothConversion.maxConversion > 0) {
          planned = Math.min(planned, inflateFromStart(rothConversion.maxConversion))
        }
      }

      return { conversionAmount: planned }
    },
    getCashflowSeries: ({ actions, holdingTaxTypeById }) => {
      const entries: CashflowSeriesEntry[] = []
      actions.forEach((action) => {
        if (action.kind !== 'convert') {
          return
        }
        const amount = action.resolvedAmount ?? action.amount
        const sourceTax = action.sourceHoldingId
          ? holdingTaxTypeById.get(action.sourceHoldingId)
          : undefined
        const targetTax = action.targetHoldingId
          ? holdingTaxTypeById.get(action.targetHoldingId)
          : undefined
        if (sourceTax) {
          entries.push({
            key: `conversions:${sourceTax}`,
            label: `Conversions - ${sourceTax}`,
            value: -amount,
            bucket: sourceTax,
          })
        }
        if (targetTax) {
          entries.push({
            key: `conversions:${targetTax}`,
            label: `Conversions - ${targetTax}`,
            value: amount,
            bucket: targetTax,
          })
        }
      })
      return entries
    },
    getActionIntents: (state, context) => {
      if (context.planMode === 'preview') {
        return []
      }
      const age = context.age
      let conversionAmount = 0
      let ladderAmount = 0
      let conversionCandidate = 0
      const inflateFromStart = (amount: number) =>
        inflateAmount(amount, context.settings.startDate, context.dateIso, cpiRate)
      const inflateFromPolicyYear = (amount: number, year: number) =>
        inflateAmount(amount, `${year}-01-01`, context.dateIso, cpiRate)

      const ladderStartAge =
        rothLadder.startAge > 0
          ? Math.max(0, rothLadder.startAge - rothLadder.leadTimeYears)
          : 0
      const ladderEndAge =
        rothLadder.endAge > 0
          ? Math.max(0, rothLadder.endAge - rothLadder.leadTimeYears)
          : 0
      if (context.isStartOfYear && rothLadder.enabled && isAgeInRange(age, ladderStartAge, ladderEndAge)) {
        ladderAmount =
          rothLadder.annualConversion > 0
            ? inflateFromStart(rothLadder.annualConversion)
            : inflateFromStart(rothLadder.targetAfterTaxSpending)
      }

      if (
        context.isStartOfYear &&
        rothConversion.enabled &&
        isAgeInRange(age, rothConversion.startAge, rothConversion.endAge)
      ) {
        if (typeof context.yearPlan?.conversionAmount === 'number') {
          conversionCandidate = context.yearPlan.conversionAmount
          explain.addCheckpoint('Planned conversion', conversionCandidate)
        } else {
          if (rothConversion.targetOrdinaryBracketRate > 0) {
            const policyYear = context.date.getFullYear()
            const policy = selectTaxPolicy(snapshot.taxPolicies, policyYear, tax.filingStatus)
            const bracket = policy?.ordinaryBrackets.find(
              (entry) => entry.rate === rothConversion.targetOrdinaryBracketRate,
            )
            if (bracket?.upTo !== null && bracket?.upTo !== undefined) {
              const policyBaseYear = policy?.year ?? policyYear
              const bracketCeiling = inflateFromPolicyYear(bracket.upTo, policyBaseYear)
              conversionCandidate = Math.max(
                0,
                bracketCeiling - state.yearLedger.ordinaryIncome,
              )
            }
          }
          if (rothConversion.respectIrmaa) {
            const policyYear = context.date.getFullYear()
            const policy = selectTaxPolicy(snapshot.taxPolicies, policyYear, tax.filingStatus)
            const table = selectIrmaaTable(snapshot.irmaaTables, policyYear, tax.filingStatus)
            const baseTier = table?.tiers[0]?.maxMagi ?? 0
            const currentMagi =
              state.yearLedger.ordinaryIncome +
              state.yearLedger.capitalGains +
              state.yearLedger.taxExemptIncome
            if (baseTier > 0) {
              const policyBaseYear = policy?.year ?? policyYear
              const tableBaseYear = table?.year ?? policyBaseYear
              const inflatedTier = inflateFromPolicyYear(baseTier, tableBaseYear)
              conversionCandidate = Math.min(
                conversionCandidate,
                Math.max(0, inflatedTier - currentMagi),
              )
            }
          }
          if (rothConversion.minConversion > 0) {
            conversionCandidate = Math.max(
              conversionCandidate,
              inflateFromStart(rothConversion.minConversion),
            )
          }
          if (rothConversion.maxConversion > 0) {
            conversionCandidate = Math.min(
              conversionCandidate,
              inflateFromStart(rothConversion.maxConversion),
            )
          }
        }
      }
      conversionAmount = Math.max(ladderAmount, conversionCandidate)

      explain.addInput('Roth ladder', rothLadder.enabled)
      explain.addInput('Roth conversion', rothConversion.enabled)
      explain.addInput('Age', age)
      explain.addInput('Target bracket rate', rothConversion.targetOrdinaryBracketRate)
      explain.addInput('Respect IRMAA', rothConversion.respectIrmaa)
      explain.addInput('Min conversion', rothConversion.minConversion)
      explain.addInput('Max conversion', rothConversion.maxConversion)
      explain.addCheckpoint('Ladder amount', ladderAmount)
      explain.addCheckpoint('Conversion candidate', conversionCandidate)
      explain.addCheckpoint('Conversion total', conversionAmount)

      if (!context.isStartOfYear) {
        return []
      }
      if (conversionAmount <= 0) {
        return []
      }

      const sourceHoldings = state.holdings
        .filter((holding) => holding.taxType === 'traditional' && holding.balance > 0)
        .sort((a, b) => b.balance - a.balance)
      const targetHolding = state.holdings.find((holding) => holding.taxType === 'roth')
      if (sourceHoldings.length === 0 || !targetHolding) {
        return []
      }

      const intents: ActionIntent[] = []
      let remaining = conversionAmount
      let priority = 40
      sourceHoldings.forEach((holding) => {
        if (remaining <= 0) {
          return
        }
        const amount = Math.min(remaining, holding.balance)
        if (amount <= 0) {
          return
        }
        intents.push({
          id: `conversion-${context.yearIndex}-${holding.id}`,
          kind: 'convert',
          amount,
          sourceHoldingId: holding.id,
          targetHoldingId: targetHolding.id,
          priority,
          label: 'Roth conversion',
        })
        remaining -= amount
        priority += 1
      })

      return intents
    },
  }
}
