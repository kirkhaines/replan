import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import type { SimulationRun, SimulationSnapshot } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import { subscribeStochasticProgress } from '../../core/simClient/stochasticProgress'
import PageHeader from '../../components/PageHeader'
import RunResultsGraphs from './RunResultsGraphs'
import RunResultsTimeline from './RunResultsTimeline'
import RunResultsDistributions, {
  type RepresentativeSelection,
} from './RunResultsDistributions'
import { inflationTypeSchema } from '../../core/models/enums'
import type { SimulationRequest } from '../../core/sim/input'
import { applyInflation, buildInflationIndexByType } from '../../core/utils/inflation'
import {
  computeTaxableSocialSecurity,
  selectSocialSecurityProvisionalIncomeBracket,
  selectTaxPolicy,
} from '../../core/sim/tax'

// ignore-large-file-size
const formatCurrency = (value: number) => {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`
  }
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }
  if (abs >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}k`
  }
  return `$${Math.round(value)}`
}

const formatSignedCurrency = (value: number) => {
  if (Math.abs(value) < 0.005) {
    return formatCurrency(0)
  }
  return formatCurrency(value)
}

const formatPercent = (value: number) => `${value.toFixed(1)}%`

const csvEscape = (value: string | number) => {
  const raw = String(value ?? '')
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

const buildRepresentativeRequest = (
  snapshot: SimulationSnapshot,
  startDate: string,
  seed: number,
) => {
  const returnModel = snapshot.scenario.strategies.returnModel
  const request = {
    snapshot: {
      ...snapshot,
      scenario: {
        ...snapshot.scenario,
        strategies: {
          ...snapshot.scenario.strategies,
          returnModel: {
            ...returnModel,
            mode: 'stochastic',
            seed,
            stochasticRuns: 0,
          },
        },
      },
    },
    startDate,
  } satisfies SimulationRequest
  return request
}

const formatAxisValue = (value: number) => {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`
  }
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }
  if (abs >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}k`
  }
  return `$${Math.round(value)}`
}

const chartPalette = [
  '#2563eb',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#0ea5e9',
  '#a3e635',
]
const enableStochasticLogs = false

const chartKeyColors: Record<string, string> = {
  'spending:cash': '#ef4444',
  'taxes:ordinary': '#f97316',
  'taxes:capital_gains': '#f59e0b',
  'returns-core:market': '#22c55e',
  'future-work:income': '#22c55e',
  'future-work:401k': '#f59e0b',
  'future-work:hsa': '#ec4899',
  'future-work:deductions': '#ef4444',
  'shock:market': '#0ea5e9',
  'shock:market:equity': '#2563eb',
  'shock:market:bonds': '#f59e0b',
  'shock:market:realEstate': '#22c55e',
  'shock:market:other': '#8b5cf6',
  'shock:inflation:cpi': '#f97316',
  'shock:inflation:medical': '#ef4444',
  'shock:inflation:housing': '#22c55e',
  'shock:inflation:education': '#8b5cf6',
}

const hashKey = (value: string) => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

const colorForChartKey = (key: string) =>
  chartKeyColors[key] ?? chartPalette[hashKey(key) % chartPalette.length]

const addMonths = (isoDate: string, months: number) => {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  date.setMonth(date.getMonth() + months)
  return date.toISOString().slice(0, 10)
}

const addYears = (isoDate: string, years: number) => addMonths(isoDate, years * 12)

const isIsoDate = (value?: string | null) => {
  if (!value) {
    return false
  }
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

type BalanceDetail = 'none' | 'seasoning' | 'asset'

const balanceDetailOptions = [
  { value: 'none', label: 'No extra detail' },
  { value: 'seasoning', label: 'Seasoning/gains' },
  { value: 'asset', label: 'Asset type' },
] as const

const assetClasses = ['equity', 'bonds', 'realEstate', 'other'] as const
const taxTypes = ['taxable', 'traditional', 'roth', 'hsa'] as const
type AssetClass = (typeof assetClasses)[number]
type TaxType = (typeof taxTypes)[number]

const balanceSeriesColors: Record<string, string> = {
  cash: '#22c55e',
  taxable: '#2563eb',
  traditional: '#f59e0b',
  roth: '#7c3aed',
  hsa: '#ec4899',
  rothSeasoned: '#7c3aed',
  rothUnseasoned: '#a855f7',
  rothNonBasis: '#d8b4fe',
  taxableContrib: '#2563eb',
  taxableRealized: '#60a5fa',
  taxableUnrealized: '#1d4ed8',
  traditionalContrib: '#f59e0b',
  traditionalRealized: '#fbbf24',
  traditionalUnrealized: '#d97706',
  hsaContrib: '#ec4899',
  hsaRealized: '#f472b6',
  hsaUnrealized: '#be185d',
}

const assetSeriesColors: Record<TaxType, Record<AssetClass, string>> = {
  taxable: {
    equity: '#2563eb',
    bonds: '#1d4ed8',
    realEstate: '#3b82f6',
    other: '#60a5fa',
  },
  traditional: {
    equity: '#f59e0b',
    bonds: '#d97706',
    realEstate: '#fbbf24',
    other: '#fcd34d',
  },
  roth: {
    equity: '#7c3aed',
    bonds: '#6d28d9',
    realEstate: '#a855f7',
    other: '#c084fc',
  },
  hsa: {
    equity: '#ec4899',
    bonds: '#db2777',
    realEstate: '#f472b6',
    other: '#fb7185',
  },
}

const colorForBalanceSeriesKey = (key: string) => {
  const override = balanceSeriesColors[key]
  if (override) {
    return override
  }
  const match = key.match(/^(taxable|traditional|roth|hsa)-(equity|bonds|realEstate|other)$/)
  if (match) {
    const [, taxType, assetClass] = match as [string, TaxType, AssetClass]
    return assetSeriesColors[taxType][assetClass]
  }
  return colorForChartKey(key)
}

const assetClassLabel: Record<(typeof assetClasses)[number], string> = {
  equity: 'Equity',
  bonds: 'Bonds',
  realEstate: 'Real estate',
  other: 'Other',
}

const toAssetClass = (holdingType?: string | null) => {
  switch (holdingType) {
    case 'bonds':
      return 'bonds'
    case 'real_estate':
      return 'realEstate'
    case 'other':
      return 'other'
    case 'cash':
      return 'cash'
    default:
      return 'equity'
  }
}

const RunResultsPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const storage = useAppStore((state) => state.storage)
  const simClient = useAppStore((state) => state.simClient)
  const [run, setRun] = useState<SimulationRun | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [showPresentDay, setShowPresentDay] = useState(true)
  const [rangeKey, setRangeKey] = useState('all')
  const [balanceDetail, setBalanceDetail] = useState<BalanceDetail>('none')
  const [showTimeline, setShowTimeline] = useState(false)
  const [representativeState, setRepresentativeState] = useState<{
    runId: string | null
    selection: RepresentativeSelection | null
    run: SimulationRun | null
    runSeed: number | null
    loading: boolean
    error: string | null
  }>({
    runId: null,
    selection: null,
    run: null,
    runSeed: null,
    loading: false,
    error: null,
  })
  const [liveStochasticProgress, setLiveStochasticProgress] = useState<{
    runId: string
    completed: number
    target: number
    cancelled: boolean
    updatedAt: number
  } | null>(null)

  const representativeSelection =
    representativeState.runId === id ? representativeState.selection : null
  const representativeRun =
    representativeState.runId === id ? representativeState.run : null
  const representativeRunSeed =
    representativeState.runId === id ? representativeState.runSeed : null
  const representativeLoading =
    representativeState.runId === id ? representativeState.loading : false
  const representativeError =
    representativeState.runId === id ? representativeState.error : null

  const displayRun = representativeRun ?? run

  const monthlyTimeline = useMemo(
    () => displayRun?.result.monthlyTimeline ?? [],
    [displayRun],
  )
  const explanations = useMemo(() => displayRun?.result.explanations ?? [], [displayRun])
  const explanationsByMonth = useMemo(() => {
    return explanations.reduce<Map<number, (typeof explanations)[number]>>((acc, entry) => {
      acc.set(entry.monthIndex, entry)
      return acc
    }, new Map())
  }, [explanations])
  const rangeOptions = useMemo(() => {
    type RangeOption = { key: string; label: string; start: string | null; end: string | null }
    if (!run?.snapshot || run.result.timeline.length === 0) {
      return [{ key: 'all', label: 'All', start: null, end: null }] as RangeOption[]
    }
    const snapshot = run.snapshot
    const { scenario } = snapshot
    const timeline = run.result.timeline
    const simStart = timeline[0].date ?? null
    const simEnd = timeline[timeline.length - 1].date ?? null
    if (!simStart || !simEnd) {
      return [{ key: 'all', label: 'All', start: null, end: null }] as RangeOption[]
    }

    const strategyIds = new Set(scenario.personStrategyIds)
    const activePersonStrategies = snapshot.personStrategies.filter((strategy) =>
      strategyIds.has(strategy.id),
    )
    const futureWorkStrategyIds = new Set(
      activePersonStrategies.map((strategy) => strategy.futureWorkStrategyId),
    )
    const socialSecurityStrategyIds = new Set(
      activePersonStrategies.map((strategy) => strategy.socialSecurityStrategyId),
    )

    const activePeriods = snapshot.futureWorkPeriods.filter((period) =>
      futureWorkStrategyIds.has(period.futureWorkStrategyId),
    )
    const retireEndDates = activePeriods
      .map((period) => (isIsoDate(period.endDate) ? period.endDate : null))
      .filter((value): value is string => Boolean(value))
    const retireEnd = retireEndDates.length > 0 ? retireEndDates.sort().slice(-1)[0] : null

    const ssaStartDates = snapshot.socialSecurityStrategies
      .filter((strategy) => socialSecurityStrategyIds.has(strategy.id))
      .map((strategy) => strategy.startDate)
      .filter((value) => isIsoDate(value))
    const ssaStart = ssaStartDates.length > 0 ? ssaStartDates.sort()[0] : null

    const primaryStrategy = scenario.personStrategyIds
      .map((id) => snapshot.personStrategies.find((strategy) => strategy.id === id))
      .find(Boolean)
    const primaryPerson = primaryStrategy
      ? snapshot.people.find((person) => person.id === primaryStrategy.personId)
      : null
    const penaltyFreeStart = primaryPerson?.dateOfBirth
      ? addMonths(primaryPerson.dateOfBirth, Math.round(59.5 * 12))
      : null
    const rmdStart =
      primaryPerson?.dateOfBirth && scenario.strategies.rmd.startAge > 0
        ? addMonths(primaryPerson.dateOfBirth, Math.round(scenario.strategies.rmd.startAge * 12))
        : null

    const withLead = (start: string, end: string) => {
      const leadStart = addYears(start, -1) ?? start
      const leadEnd = addYears(end, 1) ?? end
      return {
        start: leadStart < simStart ? simStart : leadStart,
        end: leadEnd > simEnd ? simEnd : leadEnd,
      }
    }

    const options: RangeOption[] = [
      { key: 'all', label: 'All', start: null, end: null },
    ]
    if (retireEnd && retireEnd > simStart) {
      options.push({
        key: 'pre-retirement',
        label: 'Pre-retirement',
        ...withLead(simStart, retireEnd),
      })
    }
    if (retireEnd && penaltyFreeStart && penaltyFreeStart > retireEnd) {
      options.push({
        key: 'bridge',
        label: 'Bridge',
        ...withLead(retireEnd, penaltyFreeStart),
      })
    }
    if (
      penaltyFreeStart &&
      ssaStart &&
      ssaStart > penaltyFreeStart &&
      (!retireEnd || penaltyFreeStart > retireEnd)
    ) {
      options.push({
        key: 'penalty-free',
        label: 'Penalty-free',
        ...withLead(penaltyFreeStart, ssaStart),
      })
    }
    if (ssaStart && rmdStart && rmdStart > ssaStart) {
      options.push({
        key: 'ssa',
        label: 'SSA',
        ...withLead(ssaStart, rmdStart),
      })
    }
    if (rmdStart && rmdStart < simEnd) {
      options.push({
        key: 'rmd',
        label: 'RMD',
        ...withLead(rmdStart, simEnd),
      })
    }
    return options
  }, [run])
  const selectedRange = rangeOptions.find((option) => option.key === rangeKey) ?? rangeOptions[0]
  const rangeYearBounds = useMemo(() => {
    if (!selectedRange.start || !selectedRange.end) {
      return null
    }
    const startYear = new Date(selectedRange.start).getFullYear()
    const endYear = new Date(selectedRange.end).getFullYear()
    if (Number.isNaN(startYear) || Number.isNaN(endYear)) {
      return null
    }
    return {
      startYear: Math.min(startYear, endYear),
      endYear: Math.max(startYear, endYear),
    }
  }, [selectedRange.end, selectedRange.start])
  const filteredMonthlyTimeline = useMemo(() => {
    if (!rangeYearBounds) {
      return monthlyTimeline
    }
    return monthlyTimeline.filter((entry) => {
      const year = new Date(entry.date).getFullYear()
      if (Number.isNaN(year)) {
        return false
      }
      return year >= rangeYearBounds.startYear && year <= rangeYearBounds.endYear
    })
  }, [monthlyTimeline, rangeYearBounds])
  const filteredTimeline = useMemo(() => {
    if (!displayRun?.result.timeline) {
      return []
    }
    if (!rangeYearBounds) {
      return displayRun.result.timeline
    }
    return displayRun.result.timeline.filter((point) => {
      if (!point.date) {
        return true
      }
      const year = new Date(point.date).getFullYear()
      if (Number.isNaN(year)) {
        return true
      }
      return year >= rangeYearBounds.startYear && year <= rangeYearBounds.endYear
    })
  }, [displayRun, rangeYearBounds])

  const mainFilteredTimeline = useMemo(() => {
    if (!run?.result.timeline) {
      return []
    }
    if (!rangeYearBounds) {
      return run.result.timeline
    }
    return run.result.timeline.filter((point) => {
      if (!point.date) {
        return true
      }
      const year = new Date(point.date).getFullYear()
      if (Number.isNaN(year)) {
        return true
      }
      return year >= rangeYearBounds.startYear && year <= rangeYearBounds.endYear
    })
  }, [rangeYearBounds, run])
  const runStartYear = useMemo(() => {
    const startDate =
      displayRun?.result.timeline?.[0]?.date ??
      displayRun?.result.monthlyTimeline?.[0]?.date
    if (!startDate) {
      return null
    }
    const year = new Date(startDate).getFullYear()
    return Number.isNaN(year) ? null : year
  }, [displayRun])
  const getCalendarYearIndex = useCallback(
    (dateIso?: string) => {
      if (!dateIso || runStartYear === null) {
        return 0
      }
      const year = new Date(dateIso).getFullYear()
      if (Number.isNaN(year)) {
        return 0
      }
      return year - runStartYear
    },
    [runStartYear],
  )
  const monthlyByYear = useMemo(() => {
    return filteredMonthlyTimeline.reduce<Map<number, typeof monthlyTimeline>>((acc, entry) => {
      const yearIndex = getCalendarYearIndex(entry.date)
      const list = acc.get(yearIndex) ?? []
      list.push(entry)
      acc.set(yearIndex, list)
      return acc
    }, new Map())
  }, [filteredMonthlyTimeline, getCalendarYearIndex])
  const accountLookup = useMemo(() => {
    const cashById = new Map<string, string>()
    const investmentById = new Map<string, string>()
    const holdingById = new Map<string, { name: string; investmentAccountId?: string }>()
    if (displayRun?.snapshot) {
      displayRun.snapshot.nonInvestmentAccounts.forEach((account) => {
        cashById.set(account.id, account.name)
      })
      displayRun.snapshot.investmentAccounts.forEach((account) => {
        investmentById.set(account.id, account.name)
      })
      displayRun.snapshot.investmentAccountHoldings.forEach((holding) => {
        holdingById.set(holding.id, {
          name: holding.name,
          investmentAccountId: holding.investmentAccountId,
        })
      })
    }
    return { cashById, investmentById, holdingById }
  }, [displayRun])
  const holdingNamesFromRun = useMemo(() => {
    const map = new Map<string, { name: string; investmentAccountId?: string }>()
    if (!displayRun?.result.explanations) {
      return map
    }
    displayRun.result.explanations.forEach((month) => {
      month.accounts.forEach((account) => {
        if (account.kind !== 'holding' || !account.name) {
          return
        }
        if (!map.has(account.id)) {
          map.set(account.id, {
            name: account.name,
            investmentAccountId: account.investmentAccountId,
          })
        }
      })
    })
    return map
  }, [displayRun])
  const holdingMetaById = useMemo(() => {
    const map = new Map<string, { taxType: string; holdingType: string }>()
    if (displayRun?.snapshot) {
      displayRun.snapshot.investmentAccountHoldings.forEach((holding) => {
        map.set(holding.id, { taxType: holding.taxType, holdingType: holding.holdingType })
      })
    }
    return map
  }, [displayRun])
  const initialBalances = useMemo(() => {
    const balances = new Map<string, number>()
    if (!displayRun?.snapshot) {
      return balances
    }
    displayRun.snapshot.nonInvestmentAccounts.forEach((account) => {
      balances.set(`cash:${account.id}`, account.balance)
    })
    displayRun.snapshot.investmentAccountHoldings.forEach((holding) => {
      balances.set(`holding:${holding.id}`, holding.balance)
    })
    return balances
  }, [displayRun])

  const presentDayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const adjustForInflation = useCallback(
    (value: number, dateIso?: string | null) => {
      if (!showPresentDay || !dateIso) {
        return value
      }
      return applyInflation({
        amount: value,
        inflationType: 'cpi',
        fromDateIso: dateIso,
        toDateIso: presentDayIso,
        run: displayRun,
      })
    },
    [displayRun, presentDayIso, showPresentDay],
  )

  const formatCurrencyForDate = (value: number, dateIso?: string | null) =>
    formatCurrency(adjustForInflation(value, dateIso))
  const formatSignedCurrencyForDate = (value: number, dateIso?: string | null) =>
    formatSignedCurrency(adjustForInflation(value, dateIso))

  const balanceOverTime = useMemo(() => {
    if (!displayRun?.snapshot) {
      return { data: [], series: [] }
    }
    const series: Array<{ key: string; label: string; color: string }> = []
    const lineSeries: Array<{ key: string; label: string; color: string }> = []
    const registerSeries = (key: string, label: string) => {
      series.push({ key, label, color: colorForBalanceSeriesKey(key) })
    }
    const registerLineSeries = (key: string, label: string, color: string) => {
      lineSeries.push({ key, label, color })
    }
    if (balanceDetail === 'none') {
      registerSeries('cash', 'Cash')
      registerSeries('taxable', 'Taxable holdings')
      registerSeries('traditional', 'Traditional holdings')
      registerSeries('roth', 'Roth holdings')
      registerSeries('hsa', 'HSA holdings')
    } else if (balanceDetail === 'seasoning') {
      registerSeries('cash', 'Cash')
      registerSeries('taxableContrib', 'Taxable contributions')
      registerSeries('taxableRealized', 'Taxable realized gains')
      registerSeries('taxableUnrealized', 'Taxable unrealized gains')
      registerSeries('traditionalContrib', 'Traditional contributions')
      registerSeries('traditionalRealized', 'Traditional realized gains')
      registerSeries('traditionalUnrealized', 'Traditional unrealized gains')
      registerSeries('rothSeasoned', 'Roth seasoned contributions')
      registerSeries('rothUnseasoned', 'Roth unseasoned contributions')
      registerSeries('rothNonBasis', 'Roth gains')
      registerSeries('hsaContrib', 'HSA contributions')
      registerSeries('hsaRealized', 'HSA realized gains')
      registerSeries('hsaUnrealized', 'HSA unrealized gains')
    } else {
      registerSeries('cash', 'Cash')
      taxTypes.forEach((taxType) => {
        assetClasses.forEach((assetClass) => {
          const key = `${taxType}-${assetClass}`
          registerSeries(key, `${taxType} - ${assetClassLabel[assetClass]}`)
        })
      })
    }
    const minBalanceRun = displayRun.result.minBalanceRun
    const minBalanceByYear = new Map<number, number>()
    if (minBalanceRun?.timeline?.length) {
      registerLineSeries(
        'minBalanceRun',
        'Minimum average successful balance',
        '#111111',
      )
      minBalanceRun.timeline.forEach((point) => {
        const yearIndex = point.date
          ? getCalendarYearIndex(point.date)
          : point.yearIndex
        const value = point.date
          ? adjustForInflation(point.balance, point.date)
          : point.balance
        minBalanceByYear.set(yearIndex, value)
      })
    }
    const data = filteredTimeline.map((point) => {
      const year = point.date ? new Date(point.date).getFullYear() : undefined
      const monthly = monthlyByYear.get(point.yearIndex)
      const lastMonth = monthly && monthly.length > 0 ? monthly[monthly.length - 1] : null
      const explanation = lastMonth
        ? explanationsByMonth.get(lastMonth.monthIndex)
        : undefined
      const accounts = explanation?.accounts
      const contributionTotals = explanation?.contributionTotals
      const totals = series.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.key] = 0
        return acc
      }, {})
      if (accounts) {
        const displayDate = lastMonth?.date ?? point.date
        const balanceByTaxType: Record<string, number> = {
          taxable: 0,
          traditional: 0,
          hsa: 0,
        }
        const basisByTaxType: Record<string, number> = {
          taxable: 0,
          traditional: 0,
          hsa: 0,
        }
        accounts.forEach((account) => {
          if (account.kind === 'cash') {
            totals.cash += adjustForInflation(account.balance, displayDate)
            return
          }
          const meta = holdingMetaById.get(account.id)
          const taxType = account.taxType ?? meta?.taxType
          const holdingType = account.holdingType ?? meta?.holdingType
          if (!taxType) {
            return
          }
          const adjustedBalance = adjustForInflation(account.balance, displayDate)
          if (balanceDetail === 'none') {
            totals[taxType] = (totals[taxType] ?? 0) + adjustedBalance
            return
          }
          if (balanceDetail === 'asset') {
            const assetClass = toAssetClass(holdingType)
            if (assetClass === 'cash') {
              totals.cash += adjustedBalance
              return
            }
            const key = `${taxType}-${assetClass}`
            totals[key] = (totals[key] ?? 0) + adjustedBalance
            return
          }
          if (taxType === 'roth') {
            const seasoned = account.basisSeasoned ?? 0
            const unseasoned = account.basisUnseasoned ?? 0
            const basisTotal = Math.min(account.balance, Math.max(0, seasoned + unseasoned))
            const nonBasis = Math.max(0, account.balance - basisTotal)
            totals.rothSeasoned += adjustForInflation(seasoned, displayDate)
            totals.rothUnseasoned += adjustForInflation(unseasoned, displayDate)
            totals.rothNonBasis += adjustForInflation(nonBasis, displayDate)
            return
          }
          if (taxType in balanceByTaxType) {
            balanceByTaxType[taxType] += adjustedBalance
            const costBasis =
              account.costBasis !== undefined ? account.costBasis : account.balance
            basisByTaxType[taxType] += adjustForInflation(costBasis, displayDate)
          }
        })
        if (balanceDetail === 'seasoning') {
          const totalsSource = contributionTotals ?? {
            taxable: 0,
            traditional: 0,
            roth: 0,
            hsa: 0,
          }
          const splitTotals = (taxType: 'taxable' | 'traditional' | 'hsa') => {
            const balance = balanceByTaxType[taxType]
            if (balance <= 0) {
              return { contributions: 0, realized: 0, unrealized: 0 }
            }
            const basis = Math.min(balance, Math.max(0, basisByTaxType[taxType]))
            const contributionsRaw = contributionTotals
              ? adjustForInflation(totalsSource[taxType], displayDate)
              : basis
            const contributions = Math.min(basis, Math.max(0, contributionsRaw))
            const realized = Math.max(0, basis - contributions)
            const unrealized = Math.max(0, balance - basis)
            return { contributions, realized, unrealized }
          }
          const taxableSplit = splitTotals('taxable')
          totals.taxableContrib += taxableSplit.contributions
          totals.taxableRealized += taxableSplit.realized
          totals.taxableUnrealized += taxableSplit.unrealized

          const traditionalSplit = splitTotals('traditional')
          totals.traditionalContrib += traditionalSplit.contributions
          totals.traditionalRealized += traditionalSplit.realized
          totals.traditionalUnrealized += traditionalSplit.unrealized

          const hsaSplit = splitTotals('hsa')
          totals.hsaContrib += hsaSplit.contributions
          totals.hsaRealized += hsaSplit.realized
          totals.hsaUnrealized += hsaSplit.unrealized
        }
      }
      const minBalanceValue = minBalanceByYear.get(point.yearIndex)
      return {
        ...point,
        year,
        ...totals,
        ...(minBalanceValue !== undefined ? { minBalanceRun: minBalanceValue } : {}),
      }
    })
    return { data, series, lineSeries }
  }, [
    adjustForInflation,
    balanceDetail,
    explanationsByMonth,
    filteredTimeline,
    getCalendarYearIndex,
    holdingMetaById,
    monthlyByYear,
    displayRun,
  ])

  const ordinaryIncomeChart = useMemo(() => {
    if (!displayRun?.snapshot) {
      return { data: [], bracketLines: [], maxValue: 0 }
    }
    const snapshot = displayRun.snapshot
    const finishedAt = displayRun.finishedAt
    const timeline = filteredTimeline
    const socialSecurityBrackets = snapshot.socialSecurityProvisionalIncomeBrackets ?? []
    const holdingTaxType = new Map(
      snapshot.investmentAccountHoldings.map((holding) => [holding.id, holding.taxType]),
    )
    const policyYear =
      snapshot.scenario.strategies.tax.policyYear || new Date(finishedAt).getFullYear()
    const totalsByYear = new Map<
      number,
      {
        salary: number
        investment: number
        socialSecurity: number
        pension: number
        taxDeferred: number
      }
    >()
    explanations.forEach((month) => {
      const yearIndex = getCalendarYearIndex(month.date)
      const totals = totalsByYear.get(yearIndex) ?? {
        salary: 0,
        investment: 0,
        socialSecurity: 0,
        pension: 0,
        taxDeferred: 0,
      }
      month.modules.forEach((module) => {
        module.cashflows.forEach((flow) => {
          if (flow.category === 'social_security') {
            totals.socialSecurity += flow.cash
            return
          }
          const amount = flow.ordinaryIncome ?? 0
          if (!amount) {
            return
          }
          if (flow.category === 'work') {
            totals.salary += amount
          } else if (flow.category === 'pension') {
            totals.pension += amount
          } else if (flow.category === 'event' || flow.category === 'other') {
            totals.investment += amount
          }
        })
        module.actions.forEach((action) => {
          if (action.kind !== 'withdraw' && action.kind !== 'convert') {
            return
          }
          let isOrdinary = action.taxTreatment === 'ordinary' || action.kind === 'convert'
          if (!isOrdinary && !action.taxTreatment && action.sourceHoldingId) {
            isOrdinary = holdingTaxType.get(action.sourceHoldingId) === 'traditional'
          }
          if (isOrdinary) {
            totals.taxDeferred += action.resolvedAmount
          }
        })
      })
      totalsByYear.set(yearIndex, totals)
    })

    const bracketLines: Array<{ key: string; label: string; rate: number }> = []
    const bracketCount = snapshot.taxPolicies.reduce((max, policy) => {
      return Math.max(max, policy.ordinaryBrackets.filter((entry) => entry.upTo !== null).length)
    }, 0)
    for (let index = 0; index < bracketCount; index += 1) {
      const samplePolicy = selectTaxPolicy(
        snapshot.taxPolicies,
        policyYear,
        snapshot.scenario.strategies.tax.filingStatus,
      )
      const rate = samplePolicy?.ordinaryBrackets[index]?.rate
      bracketLines.push({
        key: `bracket_${index}`,
        label: rate !== undefined ? `${Math.round(rate * 100)}% bracket` : `Bracket ${index + 1}`,
        rate: rate ?? 0,
      })
    }

    type OrdinaryIncomeChartEntry = {
      age: number
      year?: number
      yearIndex: number
      salaryIncome: number
      investmentIncome: number
      socialSecurityIncome: number
      pensionIncome: number
      taxDeferredIncome: number
      standardDeduction: number
      ledgerDeductions: number
    } & Record<string, number>

    const data = timeline.map((point) => {
      const totals = totalsByYear.get(point.yearIndex) ?? {
        salary: 0,
        investment: 0,
        socialSecurity: 0,
        pension: 0,
        taxDeferred: 0,
      }
      const pointYear = point.date
        ? new Date(point.date).getFullYear()
        : new Date(finishedAt).getFullYear()
      const policy = selectTaxPolicy(
        snapshot.taxPolicies,
        pointYear,
        snapshot.scenario.strategies.tax.filingStatus,
      )
      const bracketValues: Record<string, number> = {}
      let standardDeduction = 0
      if (policy) {
        const policyBaseYear = policy.year ?? pointYear
        const policyBaseIso = `${policyBaseYear}-01-01`
        const pointYearIso = `${pointYear}-01-01`
        if (snapshot.scenario.strategies.tax.useStandardDeduction) {
          standardDeduction = applyInflation({
            amount: policy.standardDeduction,
            inflationType: 'cpi',
            fromDateIso: policyBaseIso,
            toDateIso: pointYearIso,
            snapshot,
          })
        }
        policy.ordinaryBrackets.forEach((bracket, index) => {
          if (bracket.upTo === null) {
            return
          }
          const absoluteValue = applyInflation({
            amount: bracket.upTo,
            inflationType: 'cpi',
            fromDateIso: policyBaseIso,
            toDateIso: pointYearIso,
            snapshot,
          })
          bracketValues[`bracket_${index}`] = adjustForInflation(absoluteValue, point.date)
        })
      }
      const ledgerDeductions = point.ledger?.deductions ?? 0
      const ledgerCapitalGains = point.ledger?.capitalGains ?? 0
      const ledgerTaxExempt = point.ledger?.taxExemptIncome ?? 0
      const nonSocialSecurityOrdinary =
        totals.salary + totals.investment + totals.pension + totals.taxDeferred
      const ssBracket = selectSocialSecurityProvisionalIncomeBracket(
        socialSecurityBrackets,
        pointYear,
        snapshot.scenario.strategies.tax.filingStatus,
      )
      const { taxableBenefits: taxableSocialSecurity } = computeTaxableSocialSecurity({
        benefits: totals.socialSecurity,
        ordinaryIncome: nonSocialSecurityOrdinary,
        capitalGains: ledgerCapitalGains,
        taxExemptIncome: ledgerTaxExempt,
        bracket: ssBracket,
      })
      return {
        age: point.age,
        year: Number.isNaN(pointYear) ? undefined : pointYear,
        yearIndex: point.yearIndex,
        salaryIncome: adjustForInflation(totals.salary, point.date),
        investmentIncome: adjustForInflation(totals.investment, point.date),
        socialSecurityIncome: adjustForInflation(taxableSocialSecurity, point.date),
        pensionIncome: adjustForInflation(totals.pension, point.date),
        taxDeferredIncome: adjustForInflation(totals.taxDeferred, point.date),
        standardDeduction: -adjustForInflation(standardDeduction, point.date),
        ledgerDeductions: -adjustForInflation(ledgerDeductions, point.date),
        ...bracketValues,
      } as OrdinaryIncomeChartEntry
    })
    const maxValue = data.reduce((max, entry) => {
      const totals =
        entry.salaryIncome +
        entry.investmentIncome +
        entry.socialSecurityIncome +
        entry.pensionIncome +
        entry.taxDeferredIncome
      // do not include tax bracket lines when determining domain
      return Math.max(max, totals)
    }, 0)

    return { data, bracketLines, maxValue }
  }, [
    adjustForInflation,
    displayRun,
    explanations,
    filteredTimeline,
    getCalendarYearIndex,
  ])

  const cashflowChart = useMemo(() => {
    if (!displayRun?.snapshot) {
      return {
        data: [],
        series: [] as Array<{ key: string; label: string; color: string; bucket: string }>,
      }
    }

    const seriesMeta = new Map<string, { label: string; color: string; bucket: string }>()
    const registerSeries = (key: string, label: string, bucket: string) => {
      if (!seriesMeta.has(key)) {
        seriesMeta.set(key, { label, color: colorForChartKey(key), bucket })
      }
    }
    const addValue = (
      row: Record<string, number | string>,
      key: string,
      label: string,
      value: number,
      dateIso: string,
      bucket: string,
    ) => {
      if (value === 0) {
        return
      }
      registerSeries(key, label, bucket)
      row[key] = Number(row[key] ?? 0) + adjustForInflation(value, dateIso)
    }

    const rowByYear = new Map<number, Record<string, number | string>>()
    filteredMonthlyTimeline.forEach((month) => {
      const yearIndex = getCalendarYearIndex(month.date)
      const point = filteredTimeline.find((entry) => entry.yearIndex === yearIndex)
      const row =
        rowByYear.get(yearIndex) ??
        ({
          age: point?.age ?? month.age,
          date: point?.date ?? month.date,
          year: point?.date ? new Date(point.date).getFullYear() : undefined,
        } as Record<string, number | string>)
      rowByYear.set(yearIndex, row)

      const explanation = explanationsByMonth.get(month.monthIndex)
      if (!explanation) {
        return
      }

      explanation.modules.forEach((module) => {
        module.cashflowSeries?.forEach((entry) => {
          addValue(
            row,
            entry.key,
            entry.label,
            entry.value,
            month.date,
            entry.bucket ?? 'cash',
          )
        })
      })
    })

    const data = filteredTimeline.map((point) => {
      const year = point.date ? new Date(point.date).getFullYear() : undefined
      return rowByYear.get(point.yearIndex) ?? { age: point.age, date: point.date, year }
    })

    const activeKeys = new Set<string>()
    data.forEach((row) => {
      Object.entries(row).forEach(([key, value]) => {
        if (key === 'age' || key === 'date' || key === 'year') {
          return
        }
        if (typeof value === 'number' && Math.abs(value) > 0.005) {
          activeKeys.add(key)
        }
      })
    })

    const series = Array.from(seriesMeta.entries())
      .filter(([key]) => activeKeys.has(key))
      .map(([key, meta]) => ({
        key,
        label: meta.label,
        color: meta.color,
        bucket: meta.bucket,
      }))

    const seriesKeys = series.map((entry) => entry.key)
    const normalizedData = data.map((row) => {
      const next = { ...row } as Record<string, number | string>
      seriesKeys.forEach((key) => {
        const value = typeof next[key] === 'number' ? next[key] : 0
        next[key] = value
        next[`${key}__pos`] = Math.max(0, value)
        next[`${key}__neg`] = Math.min(0, value)
      })
      return next
    })

    return { data: normalizedData, series }
  }, [
    adjustForInflation,
    displayRun,
    explanationsByMonth,
    filteredMonthlyTimeline,
    filteredTimeline,
    getCalendarYearIndex,
  ])

  const shockRateChart = useMemo(() => {
    if (!displayRun?.snapshot || filteredMonthlyTimeline.length === 0) {
      return { data: [], series: [] as Array<{ key: string; label: string; color: string }> }
    }
    const startDate = displayRun.result.monthlyTimeline?.[0]?.date
    if (!startDate) {
      return { data: [], series: [] as Array<{ key: string; label: string; color: string }> }
    }
    const months = displayRun.result.monthlyTimeline?.length ?? 0
    if (months <= 0) {
      return { data: [], series: [] as Array<{ key: string; label: string; color: string }> }
    }
    const endDate =
      displayRun.result.monthlyTimeline?.[months - 1]?.date ?? startDate
    const settings = {
      startDate,
      endDate,
      months,
      stepMonths: 1,
    }
    const inflationIndexByType = buildInflationIndexByType(displayRun.snapshot, settings)
    const inflationTypes = inflationTypeSchema.options.filter((type) => type !== 'none')

    const yearBuckets = new Map<
      number,
      {
        count: number
        products: Record<string, number>
      }
    >()

    const resolveInflationRate = (type: string, monthIndex: number) => {
      const index = inflationIndexByType[type as keyof typeof inflationIndexByType]
      if (!index || monthIndex + 1 >= index.length) {
        return 0
      }
      const start = index[monthIndex] ?? 1
      const end = index[monthIndex + 1] ?? start
      if (start === 0) {
        return 0
      }
      return end / start - 1
    }

    filteredMonthlyTimeline.forEach((month) => {
      const year = new Date(month.date).getFullYear()
      if (Number.isNaN(year)) {
        return
      }
      const bucket =
        yearBuckets.get(year) ?? {
          count: 0,
          products: {},
        }
      const explanation = explanationsByMonth.get(month.monthIndex)
      const returnModule = explanation?.modules.find(
        (module) => module.moduleId === 'returns-core',
      )
      const marketReturns = returnModule?.marketReturns ?? []
      const marketByAsset: Record<string, { start: number; amount: number }> = {}
      marketReturns.forEach((entry) => {
        if (entry.kind !== 'holding') {
          return
        }
        const assetClass = toAssetClass(entry.holdingType)
        if (assetClass === 'cash') {
          return
        }
        const key = `market:${assetClass}`
        const totals = marketByAsset[key] ?? { start: 0, amount: 0 }
        totals.start += entry.balanceStart
        totals.amount += entry.amount
        marketByAsset[key] = totals
      })
      Object.entries(marketByAsset).forEach(([key, totals]) => {
        const rate = totals.start > 0 ? totals.amount / totals.start : 0
        bucket.products[key] = (bucket.products[key] ?? 1) * (1 + rate)
      })
      inflationTypes.forEach((type) => {
        const key = `inflation:${type}`
        const rate = resolveInflationRate(type, month.monthIndex)
        bucket.products[key] = (bucket.products[key] ?? 1) * (1 + rate)
      })
      bucket.count += 1
      yearBuckets.set(year, bucket)
    })

    const data = Array.from(yearBuckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, bucket]) => {
        const row: Record<string, number> = { year }
        Object.entries(bucket.products).forEach(([key, product]) => {
          row[key] = product - 1
        })
        return row
      })

    const series = [
      { key: 'market:equity', label: 'Market - Equity', color: colorForChartKey('shock:market:equity') },
      { key: 'market:bonds', label: 'Market - Bonds', color: colorForChartKey('shock:market:bonds') },
      { key: 'market:realEstate', label: 'Market - Real estate', color: colorForChartKey('shock:market:realEstate') },
      { key: 'market:other', label: 'Market - Other', color: colorForChartKey('shock:market:other') },
      ...inflationTypes.map((type) => {
        const label =
          type === 'cpi'
            ? 'Inflation - CPI'
            : type === 'medical'
              ? 'Inflation - Medical'
              : type === 'housing'
                ? 'Inflation - Housing'
                : type === 'education'
                  ? 'Inflation - Education'
                  : `Inflation - ${type}`
        const colorKey =
          type === 'cpi'
            ? 'shock:inflation:cpi'
            : type === 'medical'
              ? 'shock:inflation:medical'
              : type === 'housing'
                ? 'shock:inflation:housing'
                : type === 'education'
                  ? 'shock:inflation:education'
                  : 'shock:inflation:education'
        return { key: `inflation:${type}`, label, color: colorForChartKey(colorKey) }
      }),
    ]

    const availableKeys = new Set<string>()
    data.forEach((row) => {
      Object.entries(row).forEach(([key, value]) => {
        if (key === 'year') {
          return
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
          availableKeys.add(key)
        }
      })
    })
    const filteredSeries = series.filter((entry) => availableKeys.has(entry.key))

    return { data, series: filteredSeries }
  }, [displayRun, explanationsByMonth, filteredMonthlyTimeline])

  const buildSummaryCsv = useCallback(() => {
    if (!run?.snapshot || !run.result.timeline || run.result.timeline.length === 0) {
      return null
    }
    const timeline = run.result.timeline
    const monthlyTimeline = run.result.monthlyTimeline ?? []
    const explanations = run.result.explanations ?? []
    const snapshot = run.snapshot
    const startDate =
      timeline[0]?.date ?? monthlyTimeline[0]?.date ?? run.result.timeline[0]?.date
    const startYear = startDate ? new Date(startDate).getFullYear() : null

    const yearFromPoint = (point: { date?: string; yearIndex: number }) => {
      if (point.date) {
        const year = new Date(point.date).getFullYear()
        return Number.isNaN(year) ? null : year
      }
      if (startYear === null) {
        return null
      }
      return startYear + point.yearIndex
    }

    const balanceByYear = new Map<number, number>()
    timeline.forEach((point) => {
      const year = yearFromPoint(point)
      if (year === null) {
        return
      }
      balanceByYear.set(year, point.balance)
    })

    const cashflowKeys = new Map<string, string>()
    const cashflowByYear = new Map<number, Record<string, number>>()
    explanations.forEach((month) => {
      const year = new Date(month.date).getFullYear()
      if (Number.isNaN(year)) {
        return
      }
      month.modules.forEach((module) => {
        module.cashflowSeries?.forEach((entry) => {
          const key = `cashflow:${entry.key}`
          if (!cashflowKeys.has(key)) {
            cashflowKeys.set(key, `${entry.label} (${entry.bucket})`)
          }
          const row = cashflowByYear.get(year) ?? {}
          row[key] = (row[key] ?? 0) + entry.value
          cashflowByYear.set(year, row)
        })
      })
    })

    const holdingTaxType = new Map(
      snapshot.investmentAccountHoldings.map((holding) => [holding.id, holding.taxType]),
    )
    const socialSecurityBrackets = snapshot.socialSecurityProvisionalIncomeBrackets ?? []
    const ordinaryTotalsByYear = new Map<
      number,
      {
        salary: number
        investment: number
        socialSecurity: number
        pension: number
        taxDeferred: number
      }
    >()
    explanations.forEach((month) => {
      const year = new Date(month.date).getFullYear()
      if (Number.isNaN(year)) {
        return
      }
      const totals = ordinaryTotalsByYear.get(year) ?? {
        salary: 0,
        investment: 0,
        socialSecurity: 0,
        pension: 0,
        taxDeferred: 0,
      }
      month.modules.forEach((module) => {
        module.cashflows.forEach((flow) => {
          if (flow.category === 'social_security') {
            totals.socialSecurity += flow.cash
            return
          }
          const amount = flow.ordinaryIncome ?? 0
          if (!amount) {
            return
          }
          if (flow.category === 'work') {
            totals.salary += amount
          } else if (flow.category === 'pension') {
            totals.pension += amount
          } else if (flow.category === 'event' || flow.category === 'other') {
            totals.investment += amount
          }
        })
        module.actions.forEach((action) => {
          if (action.kind !== 'withdraw' && action.kind !== 'convert') {
            return
          }
          let isOrdinary = action.taxTreatment === 'ordinary' || action.kind === 'convert'
          if (!isOrdinary && !action.taxTreatment && action.sourceHoldingId) {
            isOrdinary = holdingTaxType.get(action.sourceHoldingId) === 'traditional'
          }
          if (isOrdinary) {
            totals.taxDeferred += action.resolvedAmount
          }
        })
      })
      ordinaryTotalsByYear.set(year, totals)
    })

    const ledgerByYear = new Map<number, { capitalGains: number; taxExemptIncome: number }>()
    timeline.forEach((point) => {
      const year = yearFromPoint(point)
      if (year === null) {
        return
      }
      ledgerByYear.set(year, {
        capitalGains: point.ledger?.capitalGains ?? 0,
        taxExemptIncome: point.ledger?.taxExemptIncome ?? 0,
      })
    })

    const years = Array.from(
      new Set([
        ...balanceByYear.keys(),
        ...cashflowByYear.keys(),
        ...ordinaryTotalsByYear.keys(),
      ]),
    ).sort((a, b) => a - b)

    const cashflowColumns = Array.from(cashflowKeys.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    )

    const header = [
      'Year',
      'Ending balance',
      ...cashflowColumns.map(([, label], index) => label || cashflowColumns[index][0]),
      'Ordinary salary income',
      'Ordinary investment income',
      'Ordinary social security (taxable)',
      'Ordinary pension income',
      'Ordinary tax-deferred income',
      'Total ordinary income',
    ]

    const rows: Array<Array<string | number>> = [header]
    years.forEach((year) => {
      const cashflowRow = cashflowByYear.get(year) ?? {}
      const totals = ordinaryTotalsByYear.get(year) ?? {
        salary: 0,
        investment: 0,
        socialSecurity: 0,
        pension: 0,
        taxDeferred: 0,
      }
      const ledger = ledgerByYear.get(year) ?? { capitalGains: 0, taxExemptIncome: 0 }
      const nonSocialSecurityOrdinary =
        totals.salary + totals.investment + totals.pension + totals.taxDeferred
      const ssBracket = selectSocialSecurityProvisionalIncomeBracket(
        socialSecurityBrackets,
        year,
        snapshot.scenario.strategies.tax.filingStatus,
      )
      const { taxableBenefits: taxableSocialSecurity } = computeTaxableSocialSecurity({
        benefits: totals.socialSecurity,
        ordinaryIncome: nonSocialSecurityOrdinary,
        capitalGains: ledger.capitalGains,
        taxExemptIncome: ledger.taxExemptIncome,
        bracket: ssBracket,
      })
      const totalOrdinary =
        totals.salary +
        totals.investment +
        taxableSocialSecurity +
        totals.pension +
        totals.taxDeferred
      const row = [
        String(year),
        balanceByYear.get(year) ?? '',
        ...cashflowColumns.map(([key]) => cashflowRow[key] ?? 0),
        totals.salary,
        totals.investment,
        taxableSocialSecurity,
        totals.pension,
        totals.taxDeferred,
        totalOrdinary,
      ]
      rows.push(row)
    })

    return rows.map((row) => row.map(csvEscape).join(',')).join('\n')
  }, [run])

  const handleExportSummary = useCallback(() => {
    if (!run) {
      return
    }
    const csv = buildSummaryCsv()
    if (!csv) {
      window.alert('Run could not be exported.')
      return
    }
    const scenarioName = run.snapshot?.scenario?.name?.trim() || run.title || 'run'
    const filenameBase = scenarioName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filenameBase || 'run'}-summary.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [buildSummaryCsv, run])

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setRun(null)
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      const data = await storage.runRepo.get(id)
      setRun(data ?? null)
      setIsLoading(false)
    }
    void load()
  }, [id, storage])

  const representativeStartDate = useMemo(() => {
    if (!run) {
      return null
    }
    return run.result.monthlyTimeline?.[0]?.date ?? run.result.timeline?.[0]?.date ?? null
  }, [run])

  const handleRepresentativeSelect = useCallback(
    (selection: RepresentativeSelection | null) => {
      setRepresentativeState((current) => {
        if (!selection) {
          return {
            runId: null,
            selection: null,
            run: null,
            runSeed: null,
            loading: false,
            error: null,
          }
        }
        const isSameRun = current.runId === id
        const currentSelection = isSameRun ? current.selection : null
        const sameSegment =
          currentSelection?.segmentMetric === selection.segmentMetric &&
          currentSelection?.segmentRange?.start === selection.segmentRange?.start &&
          currentSelection?.segmentRange?.end === selection.segmentRange?.end
        if (
          currentSelection &&
          currentSelection.run.seed === selection.run.seed &&
          currentSelection.metric === selection.metric &&
          currentSelection.rangeStart === selection.rangeStart &&
          currentSelection.rangeEnd === selection.rangeEnd &&
          sameSegment
        ) {
          return {
            runId: null,
            selection: null,
            run: null,
            runSeed: null,
            loading: false,
            error: null,
          }
        }
        return {
          runId: id ?? null,
          selection,
          run: null,
          runSeed: null,
          loading: true,
          error: null,
        }
      })
    },
    [id],
  )

  useEffect(() => {
    if (!representativeSelection || !run?.snapshot || !representativeStartDate) {
      return
    }
    const seed = representativeSelection.run.seed
    if (representativeRun && representativeRunSeed === seed) {
      return
    }
    let cancelled = false
    const request = buildRepresentativeRequest(run.snapshot, representativeStartDate, seed)
    simClient
      .runScenario(request)
      .then((nextRun) => {
        if (cancelled) {
          return
        }
        setRepresentativeState((current) => {
          if (current.runId !== id || current.selection?.run.seed !== seed) {
            return current
          }
          return {
            ...current,
            run: nextRun,
            runSeed: seed,
            loading: false,
            error: null,
          }
        })
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        console.error('[RunResults] Representative run failed.', error)
        setRepresentativeState((current) => {
          if (current.runId !== id || current.selection?.run.seed !== seed) {
            return current
          }
          return {
            ...current,
            run: null,
            runSeed: null,
            loading: false,
            error: 'Representative run failed to load.',
          }
        })
      })
    return () => {
      cancelled = true
    }
  }, [
    id,
    representativeSelection,
    representativeStartDate,
    representativeRun,
    representativeRunSeed,
    run?.snapshot,
    simClient,
  ])

  const stochasticTarget = useMemo(() => {
    const raw = run?.snapshot?.scenario.strategies.returnModel.stochasticRuns
    return Number.isFinite(raw) ? Math.max(0, Math.floor(raw ?? 0)) : 0
  }, [run])
  const storedCompleted = run?.result.stochasticRuns?.length ?? 0
  const storedCancelled = run?.result.stochasticRunsCancelled ?? false
  const liveProgress =
    id && liveStochasticProgress?.runId === id ? liveStochasticProgress : null
  const liveCompleted = liveProgress?.completed ?? 0
  const liveTarget = liveProgress?.target
  const liveCancelled = liveProgress?.cancelled ?? false
  const stochasticCompleted = Math.max(storedCompleted, liveCompleted)
  const stochasticTargetResolved = liveTarget ?? stochasticTarget
  const stochasticCancelled = storedCancelled || liveCancelled
  const stochasticAvailable = run?.result.stochasticRuns?.length ?? 0
  const stochasticPending =
    stochasticTargetResolved > 0 &&
    stochasticCompleted < stochasticTargetResolved &&
    !stochasticCancelled
  const stochasticFinalizing =
    !stochasticCancelled &&
    stochasticTargetResolved > 0 &&
    stochasticCompleted >= stochasticTargetResolved &&
    stochasticAvailable < stochasticTargetResolved
  const stochasticInProgress = stochasticPending || stochasticFinalizing
  const mainRunReady = (run?.result.timeline?.length ?? 0) > 0
  const minBalanceComplete =
    run?.result.minBalanceRunComplete ?? Boolean(run?.result.minBalanceRun)
  const needsStochasticSync =
    (liveProgress?.completed ?? 0) > storedCompleted ||
    (liveProgress?.cancelled ?? false) !== storedCancelled

  useEffect(() => {
    if (!id) {
      return
    }
    return subscribeStochasticProgress(id, (update) => {
      setLiveStochasticProgress({
        runId: update.runId,
        completed: update.completed,
        target: update.target,
        cancelled: update.cancelled,
        updatedAt: update.updatedAt,
      })
    })
  }, [id])

  useEffect(() => {
    if (!run) {
      return
    }
    if (enableStochasticLogs) {
      console.info('[RunResults] Stochastic progress updated.', {
        ts: new Date().toISOString(),
        runId: run.id,
        completed: stochasticCompleted,
        target: stochasticTargetResolved,
        cancelled: stochasticCancelled,
        pending: stochasticPending,
      })
    }
  }, [
    run,
    stochasticCancelled,
    stochasticCompleted,
    stochasticPending,
    stochasticTargetResolved,
  ])

  const handleCancelStochastic = useCallback(async () => {
    if (!run) {
      return
    }
    const updated = {
      ...run,
      result: {
        ...run.result,
        stochasticRunsCancelled: true,
      },
    }
    await storage.runRepo.upsert(updated)
    setRun(updated)
  }, [run, storage])

  const needsRunSync = Boolean(run) && !mainRunReady

  useEffect(() => {
    if (!id || (!stochasticPending && !needsStochasticSync && !needsRunSync)) {
      return
    }
    let cancelled = false
    const interval = setInterval(async () => {
      const data = await storage.runRepo.get(id)
      if (cancelled) {
        return
      }
      if (data) {
        if (enableStochasticLogs) {
          console.info('[RunResults] Polled run update.', {
            ts: new Date().toISOString(),
            runId: data.id,
            completed: data.result.stochasticRuns?.length ?? 0,
            target: data.snapshot?.scenario.strategies.returnModel.stochasticRuns ?? 0,
            cancelled: data.result.stochasticRunsCancelled ?? false,
          })
        }
        setRun(data)
      }
    }, 1500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [id, needsRunSync, needsStochasticSync, stochasticPending, storage])

  useEffect(() => {
    if (titleInputRef.current) {
      titleInputRef.current.value = run?.title ?? ''
    }
  }, [run])

  const handleTitleCommit = useCallback(async (rawValue: string) => {
    if (!run) {
      return
    }
    const trimmed = rawValue.trim()
    const nextTitle = trimmed.length > 0 ? trimmed : undefined
    if (nextTitle === run.title) {
      return
    }
    const updated = { ...run, title: nextTitle }
    await storage.runRepo.upsert(updated)
    setRun(updated)
  }, [run, storage])

  const handleTitleBlur = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      void handleTitleCommit(event.target.value)
    },
    [handleTitleCommit],
  )

  const handleTitleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') {
        return
      }
      event.preventDefault()
      event.currentTarget.blur()
    },
    [],
  )

  const summary = useMemo(() => {
    if (!run) {
      return {
        endingBalance: 0,
        minBalance: 0,
      }
    }
    if (mainFilteredTimeline.length === 0) {
      return {
        endingBalance: 0,
        minBalance: 0,
      }
    }
    const balances = mainFilteredTimeline.map((point) =>
      showPresentDay ? adjustForInflation(point.balance, point.date) : point.balance,
    )
    return {
      endingBalance: balances.length > 0 ? balances[balances.length - 1] : 0,
      minBalance: balances.length > 0 ? Math.min(...balances) : 0,
    }
  }, [adjustForInflation, mainFilteredTimeline, run, showPresentDay])

  const representativeBannerLabel = useMemo(() => {
    if (!representativeSelection) {
      return ''
    }
    const metricLabel =
      representativeSelection.metric === 'endingBalance' ? 'ending balance' : 'minimum balance'
    const rangeStart = Math.min(
      representativeSelection.rangeStart,
      representativeSelection.rangeEnd,
    )
    const rangeEnd = Math.max(
      representativeSelection.rangeStart,
      representativeSelection.rangeEnd,
    )
    const rangeLabel = `${formatCurrency(rangeStart)} - ${formatCurrency(rangeEnd)}`
    let segmentLabel = ''
    if (representativeSelection.segmentRange && representativeSelection.segmentMetric !== 'none') {
      const segmentLabels: Record<string, string> = {
        guardrailFactorAvg: 'Guardrail avg',
        guardrailFactorMin: 'Guardrail min',
        guardrailFactorBelowPct: 'Guardrail active',
      }
      const segmentRange = representativeSelection.segmentRange
      const startLabel = formatPercent(segmentRange.start * 100)
      const endLabel = formatPercent(segmentRange.end * 100)
      const label = segmentLabels[representativeSelection.segmentMetric] ?? 'Segment'
      segmentLabel =
        segmentRange.start === segmentRange.end
          ? `${label} ${startLabel}`
          : `${label} ${startLabel} - ${endLabel}`
    }
    return `${metricLabel} ${rangeLabel}${segmentLabel ? `, ${segmentLabel}` : ''}`
  }, [representativeSelection])

  const progressLabel = useMemo(() => {
    if (isLoading || !run) {
      return 'Loading run...'
    }
    if (!mainRunReady) {
      return minBalanceComplete
        ? 'Running average simulation...'
        : 'Finding minimum successful balance factor...'
    }
    if (stochasticPending) {
      return `Running stochastic trials: ${stochasticCompleted} of ${stochasticTargetResolved}`
    }
    if (stochasticFinalizing) {
      return 'Finalizing stochastic results...'
    }
    return null
  }, [
    isLoading,
    mainRunReady,
    minBalanceComplete,
    run,
    stochasticCompleted,
    stochasticFinalizing,
    stochasticPending,
    stochasticTargetResolved,
  ])

  const progressPct =
    stochasticPending && stochasticTargetResolved > 0
      ? Math.min(100, Math.max(0, (stochasticCompleted / stochasticTargetResolved) * 100))
      : null

  const stochasticSuccessPct = useMemo(() => {
    const stochasticRuns = run?.result.stochasticRuns ?? []
    if (stochasticRuns.length === 0) {
      return null
    }
    const successCount = stochasticRuns.filter((entry) => entry.endingBalance >= 0).length
    return (successCount / stochasticRuns.length) * 100
  }, [run?.result.stochasticRuns])

  const timelineDecades = useMemo(() => {
    const decades = new Set<number>()
    filteredTimeline.forEach((point) => {
      if (!point.date) {
        return
      }
      const year = new Date(point.date).getFullYear()
      if (Number.isNaN(year)) {
        return
      }
      decades.add(Math.floor(year / 10) * 10)
    })
    return Array.from(decades).sort((a, b) => a - b)
  }, [filteredTimeline])

  const handleJumpTo = useCallback(
    (sectionId: string) => () => {
      const element = document.getElementById(sectionId)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      if (sectionId === 'section-timeline' || sectionId.startsWith('timeline-')) {
        setShowTimeline(true)
        setTimeout(() => {
          const next = document.getElementById(sectionId)
          if (next) {
            next.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }, 0)
      }
    },
    [],
  )

  if (!run && !isLoading) {
    return (
      <section className="stack">
        <h1>Run not found</h1>
        <Link className="link" to="/scenarios">
          Back to scenarios
        </Link>
      </section>
    )
  }

  const getHoldingLabel = (holdingId: string) => {
    const holding =
      accountLookup.holdingById.get(holdingId) ?? holdingNamesFromRun.get(holdingId)
    if (!holding) {
      return holdingId
    }
    const accountName = holding.investmentAccountId
      ? accountLookup.investmentById.get(holding.investmentAccountId)
      : null
    return accountName ? `${holding.name} (${accountName})` : holding.name
  }

  const getAccountLabel = (entry: { id: string; kind: 'cash' | 'holding' }) => {
    if (entry.kind === 'cash') {
      return accountLookup.cashById.get(entry.id) ?? entry.id
    }
    return getHoldingLabel(entry.id)
  }

  return (
    <section className="stack">
      <PageHeader
        title="Run results"
        subtitle={run ? new Date(run.finishedAt).toLocaleString() : 'Loading...'}
        actions={
          run ? (
            <Link
              className="link"
              to={`/scenarios/${run.scenarioId}`}
              state={{ from: location.pathname }}
            >
              Back to scenario
            </Link>
          ) : null
        }
      />

      {run?.status === 'error' ? (
        <div className="card">
          <p className="error">{run.errorMessage ?? 'Simulation failed.'}</p>
        </div>
      ) : null}

      <div className="scenario-layout">
        <div className="stack">
          <div className="card stack" id="section-summary">
            <h2>Summary</h2>
            <div className="stack" style={{ gap: '1rem' }}>
              <label className="field">
                <span>Run title</span>
                <input
                  ref={titleInputRef}
                  defaultValue={run?.title ?? ''}
                  onBlur={handleTitleBlur}
                  onKeyDown={handleTitleKeyDown}
                  placeholder="Untitled run"
                />
              </label>
              <div className="summary">
                <div>
                  <span className="muted">Ending balance</span>
                  <strong>{formatCurrency(summary.endingBalance)}</strong>
                </div>
                <div>
                  <span className="muted">Min balance</span>
                  <strong>{formatCurrency(summary.minBalance)}</strong>
                </div>
                <div>
                  <span className="muted">Success %</span>
                  <strong>
                    {stochasticSuccessPct === null
                      ? '—'
                      : formatPercent(stochasticSuccessPct)}
                  </strong>
                </div>
              </div>
              {progressLabel ? (
                <div className="stack">
                  <p className="muted">{progressLabel}</p>
                  <div
                    style={{
                      background: 'var(--border)',
                      borderRadius: '999px',
                      height: '10px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${(progressPct ?? 100).toFixed(1)}%`,
                        height: '100%',
                        background: 'var(--accent)',
                        transition: 'width 200ms ease',
                      }}
                    />
                  </div>
                  {stochasticInProgress && handleCancelStochastic ? (
                    <button
                      className="button secondary"
                      type="button"
                      onClick={handleCancelStochastic}
                    >
                      Cancel trials
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="row" style={{ flexWrap: 'wrap', gap: '1.5rem' }}>
                <div className="field">
                  <span>Display</span>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={showPresentDay}
                      onChange={(event) => setShowPresentDay(event.target.checked)}
                    />
                    Show values in present-day dollars
                  </label>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  onClick={handleExportSummary}
                  disabled={!mainRunReady}
                >
                  Export summary CSV
                </button>
                <label className="field">
                  <span>Date range</span>
                  <select
                    value={rangeKey}
                    onChange={(event) => setRangeKey(event.target.value)}
                  >
                    {rangeOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          {mainRunReady ? (
            <>
              {!stochasticInProgress &&
              (stochasticTargetResolved === 0 ||
                stochasticCancelled ||
                stochasticAvailable >= stochasticTargetResolved) ? (
                <RunResultsDistributions
                  stochasticRuns={run?.result.stochasticRuns}
                  formatAxisValue={formatAxisValue}
                  formatCurrency={formatCurrency}
                  stochasticCancelled={stochasticCancelled}
                  onSelectRepresentative={handleRepresentativeSelect}
                />
              ) : null}

              {representativeSelection ? (
                <div
                  className="card"
                  style={{
                    position: 'sticky',
                    top: '5.5rem',
                    zIndex: 5,
                    display: 'grid',
                    gap: '0.75rem',
                    background: '#fff4e5',
                    borderColor: '#f2b66d',
                  }}
                >
                  <span className="muted">Displaying a representative run</span>
                  <div
                    className="row"
                    style={{
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '1rem',
                    }}
                  >
                    <div>{representativeBannerLabel}</div>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => handleRepresentativeSelect(null)}
                    >
                      Return to main run
                    </button>
                  </div>
                  {representativeLoading ? (
                    <p className="muted">Loading representative run...</p>
                  ) : null}
                  {representativeError ? (
                    <p className="error">{representativeError}</p>
                  ) : null}
                </div>
              ) : null}

              <RunResultsGraphs
                balanceDetail={balanceDetail}
                balanceDetailOptions={balanceDetailOptions}
                onBalanceDetailChange={setBalanceDetail}
                balanceOverTime={balanceOverTime}
                ordinaryIncomeChart={ordinaryIncomeChart}
                cashflowChart={cashflowChart}
                shockRateChart={shockRateChart}
                showShockChartInitially={Boolean(representativeSelection)}
                formatAxisValue={formatAxisValue}
                formatCurrency={formatCurrency}
                formatSignedCurrency={formatSignedCurrency}
              />

              <RunResultsTimeline
                showTimeline={showTimeline}
                onToggleTimeline={() => setShowTimeline((current) => !current)}
                filteredTimeline={filteredTimeline}
                monthlyByYear={monthlyByYear}
                explanationsByMonth={explanationsByMonth}
                addMonths={addMonths}
                formatCurrencyForDate={formatCurrencyForDate}
                formatSignedCurrencyForDate={formatSignedCurrencyForDate}
                formatSignedCurrency={formatSignedCurrency}
                getHoldingLabel={getHoldingLabel}
                getAccountLabel={getAccountLabel}
                accountLookup={accountLookup}
                initialBalances={initialBalances}
                adjustForInflation={adjustForInflation}
              />
            </>
          ) : null}
        </div>

        <aside className="scenario-toc" aria-label="Jump to section">
          <div className="stack">
            <span className="muted">Jump to</span>
            <div className="run-results-toc-primary">
              {run ? (
                <Link
                  className="link-button"
                  to={`/scenarios/${run.scenarioId}`}
                  state={{ from: location.pathname }}
                >
                  Back to scenario
                </Link>
              ) : null}
              <button
                className="link-button"
                type="button"
                onClick={handleJumpTo('section-summary')}
              >
                Summary
              </button>
              {mainRunReady ? (
                <>
                  {!stochasticInProgress &&
                  (stochasticTargetResolved === 0 ||
                    stochasticCancelled ||
                    stochasticAvailable >= stochasticTargetResolved) ? (
                    <button
                      className="link-button"
                      type="button"
                      onClick={handleJumpTo('section-distributions')}
                    >
                      Balance distributions
                    </button>
                  ) : null}
                  <button
                    className="link-button"
                    type="button"
                    onClick={handleJumpTo('section-balance')}
                  >
                    Balance over time
                  </button>
                  <button
                    className="link-button"
                    type="button"
                    onClick={handleJumpTo('section-ordinary-income')}
                  >
                    Taxable ordinary income
                  </button>
                  <button
                    className="link-button"
                    type="button"
                    onClick={handleJumpTo('section-cashflow')}
                  >
                    Cash flow by module
                  </button>
                  {shockRateChart.data.length > 0 ? (
                    <button
                      className="link-button"
                      type="button"
                      onClick={handleJumpTo('section-shocks')}
                    >
                      Inflation & return rates
                    </button>
                  ) : null}
                  <button
                    className="link-button"
                    type="button"
                    onClick={handleJumpTo('section-timeline')}
                  >
                    Timeline
                  </button>
                </>
              ) : null}
            </div>
            {mainRunReady && timelineDecades.length > 0 ? (
              <div className="run-results-toc-secondary">
                {timelineDecades.map((decade) => (
                  <button
                    key={decade}
                    className="link-button muted"
                    type="button"
                    onClick={handleJumpTo(`timeline-decade-${decade}`)}
                  >
                    {decade}s
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  )
}

export default RunResultsPage
