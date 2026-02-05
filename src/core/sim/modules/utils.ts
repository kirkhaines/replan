import type { SimulationSnapshot } from '../../models'
import { applyInflation } from '../../utils/inflation'
import type { ActionRecord, CashflowSeriesEntry, SimHolding } from '../types'

export const toMonthlyRate = (annualRate: number) => Math.pow(1 + annualRate, 1 / 12) - 1

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

export const monthsBetween = (startIso: string, endIso: string) => {
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

export const isWithinRange = (dateIso: string, start?: string | null, end?: string | null) => {
  const date = parseIsoDate(dateIso)
  if (!date) {
    return false
  }
  const startDate = parseIsoDate(start ?? null)
  const endDate = parseIsoDate(end ?? null)
  if (startDate && date < startDate) {
    return false
  }
  if (endDate && date >= endDate) {
    return false
  }
  return true
}

export const isSameMonth = (dateIso: string, targetIso: string) => {
  const date = parseIsoDate(dateIso)
  const target = parseIsoDate(targetIso)
  if (!date || !target) {
    return false
  }
  return (
    date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth()
  )
}

export const inflateAmount = (
  amount: number,
  startIso: string | null,
  currentIso: string,
  rate: number,
) =>
  applyInflation({
    amount,
    inflationType: 'cpi',
    fromDateIso: startIso,
    toDateIso: currentIso,
    rateOverride: rate,
  })

export const sumMonthlySpending = (
  items: SimulationSnapshot['spendingLineItems'],
  scenario: SimulationSnapshot['scenario'],
  dateIso: string,
  defaultStartIso?: string,
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
      }) +
      applyInflation({
        amount: item.wantAmount,
        inflationType: item.inflationType,
        fromDateIso: startIso,
        toDateIso: dateIso,
        scenario,
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
