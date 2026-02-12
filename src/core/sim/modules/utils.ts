import type { SimulationSnapshot } from '../../models'
import type { InflationAssumptions, InflationType } from '../../utils/inflation'
import { applyInflation } from '../../utils/inflation'
import {
  isSameMonthIsoDates,
  monthsBetweenIsoDates,
  parseIsoDateUtc,
} from '../../utils/date'
import type { ActionRecord, CashflowSeriesEntry, SimHolding } from '../types'

export const toMonthlyRate = (annualRate: number) => Math.pow(1 + annualRate, 1 / 12) - 1

export const monthsBetween = monthsBetweenIsoDates

export const isWithinRange = (dateIso: string, start?: string | null, end?: string | null) => {
  const date = parseIsoDateUtc(dateIso)
  if (!date) {
    return false
  }
  const startDate = parseIsoDateUtc(start ?? null)
  const endDate = parseIsoDateUtc(end ?? null)
  if (startDate && date < startDate) {
    return false
  }
  if (endDate && date >= endDate) {
    return false
  }
  return true
}

export const isSameMonth = (dateIso: string, targetIso: string) => {
  return isSameMonthIsoDates(dateIso, targetIso)
}

export const inflateAmount = (
  amount: number,
  startIso: string | null,
  currentIso: string,
  assumptions: InflationAssumptions,
  options?: { indexByType?: Record<InflationType, number[]>; indexStartDateIso?: string },
) =>
  applyInflation({
    amount,
    inflationType: 'cpi',
    fromDateIso: startIso,
    toDateIso: currentIso,
    assumptions,
    indexByType: options?.indexByType,
    indexStartDateIso: options?.indexStartDateIso,
  })

export const sumMonthlySpending = (
  items: SimulationSnapshot['spendingLineItems'],
  scenario: SimulationSnapshot['scenario'],
  dateIso: string,
  defaultStartIso?: string,
  options?: {
    indexByType?: Record<InflationType, number[]>
    indexStartDateIso?: string
  },
) =>
  items.reduce((total, item) => {
    if (!isWithinRange(dateIso, item.startDate, item.endDate)) {
      return total
    }
    const startIso =
      item.startDate && item.startDate !== '' ? item.startDate : defaultStartIso ?? null
    const monthly =
      applyInflation({
        amount: item.needAmount,
        inflationType: item.inflationType,
        fromDateIso: startIso,
        toDateIso: dateIso,
        scenario,
        indexByType: options?.indexByType,
        indexStartDateIso: options?.indexStartDateIso,
      }) +
      applyInflation({
        amount: item.wantAmount,
        inflationType: item.inflationType,
        fromDateIso: startIso,
        toDateIso: dateIso,
        scenario,
        indexByType: options?.indexByType,
        indexStartDateIso: options?.indexStartDateIso,
      })
    return total + monthly
  }, 0)

type AssetClass = 'equity' | 'bonds' | 'cash' | 'realEstate' | 'other'

export const toAssetClass = (holding: SimHolding): AssetClass => {
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

export const taxAwareSellPriority: Record<SimHolding['taxType'], number> = {
  traditional: 0,
  hsa: 1,
  roth: 2,
  taxable: 3,
}

const sumCostBasis = (entries: SimHolding['costBasisEntries']) =>
  entries.reduce((sum, entry) => sum + entry.amount, 0)

export const getHoldingGain = (holding: SimHolding) =>
  holding.balance - sumCostBasis(holding.costBasisEntries)

export const interpolateTargets = (
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
    realEstate: lower.realEstate + (upper.realEstate - lower.realEstate) * ratio,
    other: lower.other + (upper.other - lower.other) * ratio,
  }
}

export const buildActionCashflowSeries = ({
  moduleId,
  moduleLabel,
  actions,
  holdingTaxTypeById,
}: {
  moduleId: string
  moduleLabel: string
  actions: ActionRecord[]
  holdingTaxTypeById: Map<string, SimHolding['taxType']>
}): CashflowSeriesEntry[] => {
  let cashDelta = 0
  const investmentByTax: Record<string, number> = {}
  actions.forEach((action) => {
    const amount = action.resolvedAmount ?? action.amount
    if (action.kind === 'deposit') {
      if (action.fromCash) {
        cashDelta -= amount
      }
      const taxType = action.targetHoldingId
        ? holdingTaxTypeById.get(action.targetHoldingId)
        : undefined
      if (taxType) {
        investmentByTax[taxType] = (investmentByTax[taxType] ?? 0) + amount
      }
      return
    }
    if (action.kind === 'withdraw' || action.kind === 'rmd') {
      cashDelta += amount
      const taxType = action.sourceHoldingId
        ? holdingTaxTypeById.get(action.sourceHoldingId)
        : undefined
      if (taxType) {
        investmentByTax[taxType] = (investmentByTax[taxType] ?? 0) - amount
      }
    }
  })

  const entries: CashflowSeriesEntry[] = []
  if (cashDelta !== 0) {
    entries.push({
      key: `${moduleId}:cash`,
      label: `${moduleLabel} - cash`,
      value: cashDelta,
      bucket: 'cash',
    })
  }
  Object.entries(investmentByTax).forEach(([taxType, value]) => {
    if (!value) {
      return
    }
    entries.push({
      key: `${moduleId}:${taxType}`,
      label: `${moduleLabel} - ${taxType}`,
      value,
      bucket: taxType as CashflowSeriesEntry['bucket'],
    })
  })
  return entries
}

export type { AssetClass }
