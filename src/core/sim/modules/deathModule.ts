import type { SimulationSnapshot } from '../../models'
import { createExplainTracker } from '../explain'
import type {
  CashflowItem,
  SimulationContext,
  SimulationModule,
  SimulationSettings,
  SimulationState,
} from '../types'
import { computeInheritanceTax, selectInheritanceTaxPolicy } from '../stateTaxes'
import type { InheritanceTaxAssetTag } from '../stateTaxes/types'
import { getHoldingGain, inflateAmount } from './utils'

const funeralCostDefaults = {
  funeral: 10000,
  burial: 8000,
  cremation: 4000,
} as const

const isDeathMonth = (context: SimulationContext) =>
  context.monthIndex === context.settings.months - 1

const sumCash = (state: SimulationState) =>
  state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)

const sumHoldings = (state: SimulationState) =>
  state.holdings.reduce((sum, holding) => sum + holding.balance, 0)

const sumPreTaxHoldings = (state: SimulationState) =>
  state.holdings.reduce((sum, holding) => {
    if (holding.taxType === 'traditional' || holding.taxType === 'hsa') {
      return sum + holding.balance
    }
    return sum
  }, 0)

const sumTaxableGains = (state: SimulationState, taxableStepUp: boolean) => {
  if (taxableStepUp) {
    return 0
  }
  return state.holdings.reduce((sum, holding) => {
    if (holding.taxType !== 'taxable') {
      return sum
    }
    return sum + Math.max(0, getHoldingGain(holding))
  }, 0)
}

const normalizeShares = (
  beneficiaries: SimulationSnapshot['scenario']['strategies']['death']['beneficiaries'],
) => {
  const total = beneficiaries.reduce((sum, entry) => sum + entry.sharePct, 0)
  if (total <= 0) {
    const equal = beneficiaries.length > 0 ? 1 / beneficiaries.length : 0
    return beneficiaries.map((entry) => ({ ...entry, normalizedShare: equal }))
  }
  return beneficiaries.map((entry) => ({
    ...entry,
    normalizedShare: entry.sharePct / total,
  }))
}

type BeneficiaryState =
  SimulationSnapshot['scenario']['strategies']['death']['beneficiaries'][number]['stateOfResidence']

type InheritanceAsset = {
  amount: number
  tags: InheritanceTaxAssetTag[]
}

const buildInheritanceAssets = (state: SimulationState): InheritanceAsset[] => {
  const assets: InheritanceAsset[] = state.cashAccounts.map((account) => ({
    amount: account.balance,
    tags: ['cash'],
  }))
  state.holdings.forEach((holding) => {
    const tags: InheritanceTaxAssetTag[] = [holding.taxType]
    if (holding.holdingType === 'real_estate') {
      tags.push('real_estate')
    }
    assets.push({ amount: holding.balance, tags })
  })
  return assets
}

const sumInheritanceAssets = (
  assets: InheritanceAsset[],
  filter: {
    includeTags?: InheritanceTaxAssetTag[]
    excludeTags?: InheritanceTaxAssetTag[]
  },
) => {
  return assets.reduce((sum, asset) => {
    const includeTags = filter.includeTags ?? []
    const excludeTags = filter.excludeTags ?? []
    if (includeTags.length > 0 && !includeTags.some((tag) => asset.tags.includes(tag))) {
      return sum
    }
    if (excludeTags.length > 0 && excludeTags.some((tag) => asset.tags.includes(tag))) {
      return sum
    }
    return sum + asset.amount
  }, 0)
}

export const createDeathModule = (
  snapshot: SimulationSnapshot,
  settings?: SimulationSettings,
): SimulationModule => {
  const strategy = snapshot.scenario.strategies.death
  const taxStrategy = snapshot.scenario.strategies.tax
  const cpiRate = snapshot.scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
  const explain = createExplainTracker(!settings?.summaryOnly)

  const resolveFuneralCost = (context: SimulationContext) => {
    const base =
      strategy.funeralCostOverride > 0
        ? strategy.funeralCostOverride
        : funeralCostDefaults[strategy.funeralDisposition]
    return inflateAmount(base, context.settings.startDate, context.dateIso, cpiRate)
  }

  return {
    id: 'death-legacy',
    explain,
    getCashflowSeries: ({ cashflows }) => {
      const totalCash = cashflows.reduce((sum, flow) => sum + flow.cash, 0)
      if (totalCash === 0) {
        return []
      }
      return [
        {
          key: 'death-legacy:cash',
          label: 'Death & legacy - cash',
          value: totalCash,
          bucket: 'cash',
        },
      ]
    },
    getCashflows: (state, context) => {
      if (!strategy.enabled || !isDeathMonth(context)) {
        return []
      }
      const grossEstate = sumCash(state) + sumHoldings(state)
      const funeralCost = resolveFuneralCost(context)
      const estateTaxable = Math.max(0, grossEstate - strategy.estateTaxExemption)
      const estateTax = estateTaxable * strategy.estateTaxRate
      const policyYear = taxStrategy.policyYear || context.date.getFullYear()
      const beneficiaries = normalizeShares(strategy.beneficiaries)
      const inheritanceAssets = buildInheritanceAssets(state)
      const taxableEstateByState = new Map<
        BeneficiaryState,
        { policy: ReturnType<typeof selectInheritanceTaxPolicy>; taxableEstate: number }
      >()
      const estateCosts = funeralCost + estateTax
      const inheritanceTax = beneficiaries.reduce((sum, entry) => {
        if (entry.stateOfResidence === 'none') {
          return sum
        }
        const cached = taxableEstateByState.get(entry.stateOfResidence)
        const resolved = cached ?? (() => {
          const policy = selectInheritanceTaxPolicy(entry.stateOfResidence, policyYear)
          const taxableEstate = policy
            ? Math.max(
                0,
                sumInheritanceAssets(inheritanceAssets, policy.assetFilters) - estateCosts,
              )
            : 0
          const value = { policy, taxableEstate }
          taxableEstateByState.set(entry.stateOfResidence, value)
          return value
        })()
        if (!resolved.policy || resolved.taxableEstate <= 0) {
          return sum
        }
        const share = resolved.taxableEstate * entry.normalizedShare
        return sum + computeInheritanceTax({
          taxableAmount: share,
          relationship: entry.relationship,
          policy: resolved.policy,
        })
      }, 0)
      const netCash = -(funeralCost + estateTax + inheritanceTax)
      const cashflows: CashflowItem[] = []
      if (funeralCost > 0) {
        cashflows.push({
          id: `death-funeral-${context.monthIndex}`,
          label: 'Funeral and disposition',
          category: 'event',
          cash: -funeralCost,
        })
      }
      if (estateTax > 0) {
        cashflows.push({
          id: `death-estate-tax-${context.monthIndex}`,
          label: 'Estate tax',
          category: 'event',
          cash: -estateTax,
        })
      }
      if (inheritanceTax > 0) {
        cashflows.push({
          id: `death-inheritance-tax-${context.monthIndex}`,
          label: 'Inheritance tax',
          category: 'event',
          cash: -inheritanceTax,
        })
      }
      explain.addInput('Enabled', strategy.enabled)
      explain.addInput('Funeral option', strategy.funeralDisposition)
      explain.addCheckpoint('Gross estate', grossEstate)
      explain.addCheckpoint('Funeral cost', funeralCost)
      explain.addCheckpoint('Estate tax', estateTax)
      explain.addCheckpoint('Inheritance tax', inheritanceTax)
      explain.addCheckpoint('Net cash impact', netCash)
      return cashflows
    },
    onEndOfYear: (state, context) => {
      if (!strategy.enabled || !isDeathMonth(context)) {
        return
      }
      const grossEstate = sumCash(state) + sumHoldings(state)
      const funeralCost = resolveFuneralCost(context)
      const estateTaxable = Math.max(0, grossEstate - strategy.estateTaxExemption)
      const estateTax = estateTaxable * strategy.estateTaxRate
      const pendingIncomeTax = state.pendingTaxDue.reduce((sum, entry) => sum + entry.amount, 0)
      const policyYear = taxStrategy.policyYear || context.date.getFullYear()
      const beneficiaries = normalizeShares(strategy.beneficiaries)
      const inheritanceAssets = buildInheritanceAssets(state)
      const taxableEstateByState = new Map<
        BeneficiaryState,
        { policy: ReturnType<typeof selectInheritanceTaxPolicy>; taxableEstate: number }
      >()
      const estateCosts = funeralCost + estateTax + pendingIncomeTax
      const estateAvailable = Math.max(
        0,
        grossEstate - funeralCost - estateTax - pendingIncomeTax,
      )
      const inheritanceTax = beneficiaries.reduce((sum, entry) => {
        if (entry.stateOfResidence === 'none') {
          return sum
        }
        const cached = taxableEstateByState.get(entry.stateOfResidence)
        const resolved = cached ?? (() => {
          const policy = selectInheritanceTaxPolicy(entry.stateOfResidence, policyYear)
          const taxableEstate = policy
            ? Math.max(
                0,
                sumInheritanceAssets(inheritanceAssets, policy.assetFilters) - estateCosts,
              )
            : 0
          const value = { policy, taxableEstate }
          taxableEstateByState.set(entry.stateOfResidence, value)
          return value
        })()
        if (!resolved.policy || resolved.taxableEstate <= 0) {
          return sum
        }
        const share = resolved.taxableEstate * entry.normalizedShare
        return sum + computeInheritanceTax({
          taxableAmount: share,
          relationship: entry.relationship,
          policy: resolved.policy,
        })
      }, 0)
      const netAfterImmediateTax = Math.max(0, estateAvailable - inheritanceTax)
      const preTaxHoldings = sumPreTaxHoldings(state)
      const taxableGains = sumTaxableGains(state, strategy.taxableStepUp)

      explain.addCheckpoint('Final income taxes due', pendingIncomeTax)
      explain.addCheckpoint('Estate available', estateAvailable)
      explain.addCheckpoint('Net legacy (immediate)', netAfterImmediateTax)

      beneficiaries.forEach((entry) => {
        const share = estateAvailable * entry.normalizedShare
        const cached = taxableEstateByState.get(entry.stateOfResidence)
        const resolved = cached ?? (() => {
          if (entry.stateOfResidence === 'none') {
            return { policy: null, taxableEstate: 0 }
          }
          const policy = selectInheritanceTaxPolicy(entry.stateOfResidence, policyYear)
          const taxableEstate = policy
            ? Math.max(
                0,
                sumInheritanceAssets(inheritanceAssets, policy.assetFilters) - estateCosts,
              )
            : 0
          const value = { policy, taxableEstate }
          taxableEstateByState.set(entry.stateOfResidence, value)
          return value
        })()
        const inheritTax =
          resolved.policy && resolved.taxableEstate > 0
            ? computeInheritanceTax({
                taxableAmount: resolved.taxableEstate * entry.normalizedShare,
                relationship: entry.relationship,
                policy: resolved.policy,
              })
            : 0
        const netShare = Math.max(0, share - inheritTax)
        const deferredOrdinary = preTaxHoldings * entry.normalizedShare * entry.assumedOrdinaryRate
        const deferredCapGains =
          taxableGains * entry.normalizedShare * entry.assumedCapitalGainsRate
        const deferredTotal = deferredOrdinary + deferredCapGains
        explain.addCheckpoint(`Legacy - ${entry.name} gross`, share)
        explain.addCheckpoint(`Legacy - ${entry.name} inheritance tax`, inheritTax)
        explain.addCheckpoint(`Legacy - ${entry.name} net`, netShare)
        explain.addCheckpoint(`Legacy - ${entry.name} deferred tax`, deferredTotal)
      })
    },
  }
}
