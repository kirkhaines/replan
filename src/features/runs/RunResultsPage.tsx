import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  AreaChart,
  Area,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { SimulationRun } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import PageHeader from '../../components/PageHeader'
import {
  computeTaxableSocialSecurity,
  selectSocialSecurityProvisionalIncomeBracket,
  selectTaxPolicy,
} from '../../core/sim/tax'

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 0 })

const formatSignedCurrency = (value: number) => {
  if (Math.abs(value) < 0.005) {
    return formatCurrency(0)
  }
  return formatCurrency(value)
}

const formatRate = (value: number) => `${(value * 100).toFixed(2)}%`

const formatMetricValue = (value: unknown) => {
  if (typeof value === 'number') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  if (value === null || value === undefined) {
    return '-'
  }
  return String(value)
}

const formatAxisValue = (value: number) => {
  const abs = Math.abs(value)
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

const chartKeyColors: Record<string, string> = {
  'spending:cash': '#ef4444',
  'taxes:ordinary': '#f97316',
  'taxes:capital_gains': '#f59e0b',
  'returns-core:market': '#22c55e',
  'future-work:income': '#22c55e',
  'future-work:401k': '#f59e0b',
  'future-work:hsa': '#ec4899',
  'future-work:deductions': '#ef4444',
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

const moduleLabels: Record<string, string> = {
  spending: 'Spending',
  events: 'Events',
  pensions: 'Pensions',
  healthcare: 'Healthcare',
  charitable: 'Charitable',
  'future-work': 'Work',
  'social-security': 'Social Security',
  'cash-buffer': 'Cash buffer',
  rebalancing: 'Rebalancing',
  conversions: 'Conversions',
  rmd: 'RMD',
  taxes: 'Taxes',
  'funding-core': 'Funding',
  'returns-core': 'Market returns',
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

type YearDetailMode = 'none' | 'month' | 'module'

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

const detailButtonStyle = (isActive: boolean) => ({
  width: '22px',
  height: '22px',
  borderRadius: '999px',
  border: '1px solid var(--border)',
  background: isActive ? 'var(--surface-muted)' : 'var(--surface)',
  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  cursor: 'pointer',
})

const CancelIcon = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

const CalendarIcon = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <rect x="2" y="3.5" width="12" height="10.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2 6.5h12" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5 2v3M11 2v3" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

const PieIcon = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <path d="M8 2a6 6 0 1 0 6 6H8z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 2v6h6" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

const RunResultsPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const storage = useAppStore((state) => state.storage)
  const [run, setRun] = useState<SimulationRun | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [yearDetailModes, setYearDetailModes] = useState<Record<number, YearDetailMode>>({})
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set())
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [showPresentDay, setShowPresentDay] = useState(true)
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set())
  const [bucketFilter, setBucketFilter] = useState('all')
  const [showBalanceChart, setShowBalanceChart] = useState(true)
  const [showOrdinaryChart, setShowOrdinaryChart] = useState(true)
  const [showCashflowChart, setShowCashflowChart] = useState(true)
  const [rangeKey, setRangeKey] = useState('all')
  const [balanceDetail, setBalanceDetail] = useState<BalanceDetail>('none')

  const monthlyTimeline = useMemo(() => run?.result.monthlyTimeline ?? [], [run])
  const explanations = useMemo(() => run?.result.explanations ?? [], [run])
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
  const monthlyByYear = useMemo(() => {
    return filteredMonthlyTimeline.reduce<Map<number, typeof monthlyTimeline>>((acc, entry) => {
      const yearIndex = Math.floor(entry.monthIndex / 12)
      const list = acc.get(yearIndex) ?? []
      list.push(entry)
      acc.set(yearIndex, list)
      return acc
    }, new Map())
  }, [filteredMonthlyTimeline])
  const accountLookup = useMemo(() => {
    const cashById = new Map<string, string>()
    const investmentById = new Map<string, string>()
    const holdingById = new Map<string, { name: string; investmentAccountId?: string }>()
    if (run?.snapshot) {
      run.snapshot.nonInvestmentAccounts.forEach((account) => {
        cashById.set(account.id, account.name)
      })
      run.snapshot.investmentAccounts.forEach((account) => {
        investmentById.set(account.id, account.name)
      })
      run.snapshot.investmentAccountHoldings.forEach((holding) => {
        holdingById.set(holding.id, {
          name: holding.name,
          investmentAccountId: holding.investmentAccountId,
        })
      })
    }
    return { cashById, investmentById, holdingById }
  }, [run])
  const holdingNamesFromRun = useMemo(() => {
    const map = new Map<string, { name: string; investmentAccountId?: string }>()
    if (!run?.result.explanations) {
      return map
    }
    run.result.explanations.forEach((month) => {
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
  }, [run])
  const holdingMetaById = useMemo(() => {
    const map = new Map<string, { taxType: string; holdingType: string }>()
    if (run?.snapshot) {
      run.snapshot.investmentAccountHoldings.forEach((holding) => {
        map.set(holding.id, { taxType: holding.taxType, holdingType: holding.holdingType })
      })
    }
    return map
  }, [run])
  const initialBalances = useMemo(() => {
    const balances = new Map<string, number>()
    if (!run?.snapshot) {
      return balances
    }
    run.snapshot.nonInvestmentAccounts.forEach((account) => {
      balances.set(`cash:${account.id}`, account.balance)
    })
    run.snapshot.investmentAccountHoldings.forEach((holding) => {
      balances.set(`holding:${holding.id}`, holding.balance)
    })
    return balances
  }, [run])

  const baseYear = useMemo(() => new Date().getFullYear(), [])
  const cpiRate = run?.snapshot?.scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
  const adjustForInflation = useCallback((value: number, dateIso?: string | null) => {
    if (!showPresentDay || !dateIso || cpiRate === 0) {
      return value
    }
    const year = new Date(dateIso).getFullYear()
    if (Number.isNaN(year)) {
      return value
    }
    const yearDelta = year - baseYear
    if (yearDelta === 0) {
      return value
    }
    return value / Math.pow(1 + cpiRate, yearDelta)
  }, [baseYear, cpiRate, showPresentDay])

  const formatCurrencyForDate = (value: number, dateIso?: string | null) =>
    formatCurrency(adjustForInflation(value, dateIso))
  const formatSignedCurrencyForDate = (value: number, dateIso?: string | null) =>
    formatSignedCurrency(adjustForInflation(value, dateIso))

  const balanceOverTime = useMemo(() => {
    if (!run?.snapshot) {
      return { data: [], series: [] }
    }
    const series: Array<{ key: string; label: string; color: string }> = []
    const registerSeries = (key: string, label: string) => {
      series.push({ key, label, color: colorForBalanceSeriesKey(key) })
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
      registerSeries('rothSeasoned', 'Roth seasoned basis')
      registerSeries('rothUnseasoned', 'Roth unseasoned basis')
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
      return { ...point, year, ...totals }
    })
    return { data, series }
  }, [
    adjustForInflation,
    balanceDetail,
    explanationsByMonth,
    filteredTimeline,
    holdingMetaById,
    monthlyByYear,
    run,
  ])

  const ordinaryIncomeChart = useMemo(() => {
    if (!run?.snapshot) {
      return { data: [], bracketLines: [], maxValue: 0 }
    }
    const snapshot = run.snapshot
    const finishedAt = run.finishedAt
    const timeline = filteredTimeline
    const inflationRate = snapshot.scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
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
      const yearIndex = Math.floor(month.monthIndex / 12)
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
        const yearDelta = pointYear - policy.year
        const inflationMultiplier =
          inflationRate !== 0 ? Math.pow(1 + inflationRate, yearDelta) : 1
        if (snapshot.scenario.strategies.tax.useStandardDeduction) {
          standardDeduction = policy.standardDeduction * inflationMultiplier
        }
        policy.ordinaryBrackets.forEach((bracket, index) => {
          if (bracket.upTo === null) {
            return
          }
          const absoluteValue = bracket.upTo * inflationMultiplier
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
  }, [adjustForInflation, explanations, filteredTimeline, run])

  const cashflowChart = useMemo(() => {
    if (!run?.snapshot) {
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
      const yearIndex = Math.floor(month.monthIndex / 12)
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
  }, [adjustForInflation, explanationsByMonth, filteredMonthlyTimeline, filteredTimeline, run])

  const visibleCashflowSeries = useMemo(() => {
    if (bucketFilter === 'all') {
      return cashflowChart.series
    }
    return cashflowChart.series.filter((series) => series.bucket === bucketFilter)
  }, [bucketFilter, cashflowChart.series])

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
        maxBalance: 0,
      }
    }
    if (filteredTimeline.length === 0) {
      return {
        endingBalance: 0,
        minBalance: 0,
        maxBalance: 0,
      }
    }
    const balances = filteredTimeline.map((point) =>
      showPresentDay ? adjustForInflation(point.balance, point.date) : point.balance,
    )
    return {
      endingBalance: balances.length > 0 ? balances[balances.length - 1] : 0,
      minBalance: balances.length > 0 ? Math.min(...balances) : 0,
      maxBalance: balances.length > 0 ? Math.max(...balances) : 0,
    }
  }, [adjustForInflation, filteredTimeline, run, showPresentDay])

  if (isLoading) {
    return <p className="muted">Loading run...</p>
  }

  if (!run) {
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

  const getYearDetailMode = (yearIndex: number): YearDetailMode =>
    yearDetailModes[yearIndex] ?? 'none'

  return (
    <section className="stack">
      <PageHeader
        title="Run results"
        subtitle={new Date(run.finishedAt).toLocaleString()}
        actions={
          <Link
            className="link"
            to={`/scenarios/${run.scenarioId}`}
            state={{ from: location.pathname }}
          >
            Back to scenario
          </Link>
        }
      />

      {run.status === 'error' ? (
        <div className="card">
          <p className="error">{run.errorMessage ?? 'Simulation failed.'}</p>
        </div>
      ) : null}

      <div className="card">
        <label className="field">
          <span>Run title</span>
          <input
            ref={titleInputRef}
            defaultValue={run.title ?? ''}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            placeholder="Untitled run"
          />
        </label>
      </div>

      <div className="card stack">
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

      <div className="card">
        <div className="row">
          <h2>Balance over time</h2>
          <div className="row" style={{ gap: '0.75rem' }}>
            <label className="field">
              <select
                value={balanceDetail}
                onChange={(event) => setBalanceDetail(event.target.value as BalanceDetail)}
              >
                {balanceDetailOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="link-button"
              type="button"
              onClick={() => setShowBalanceChart((current) => !current)}
            >
              {showBalanceChart ? '▾' : '▸'} {showBalanceChart ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        {showBalanceChart ? (
          <>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={balanceOverTime.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value) => formatAxisValue(Number(value))} width={70} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) {
                        return null
                      }
                      const row = payload[0]?.payload as { year?: number; age?: number } | undefined
                      const label = row?.year
                        ? `${row.year} (age ${row.age ?? '-'})`
                        : `${row?.age ?? ''}`
                      const total = payload.reduce((sum, entry) => sum + Number(entry.value ?? 0), 0)
                      return (
                        <div
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            boxShadow: '0 12px 24px rgba(25, 32, 42, 0.12)',
                            padding: '10px 12px',
                          }}
                        >
                          <div className="tooltip-label">{label}</div>
                          {payload.map((entry) => (
                            <div key={String(entry.dataKey)} style={{ color: entry.color }}>
                              {entry.name}: {formatCurrency(Number(entry.value))}
                            </div>
                          ))}
                          <div className="tooltip-total">Total: {formatCurrency(total)}</div>
                        </div>
                      )
                    }}
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      boxShadow: '0 12px 24px rgba(25, 32, 42, 0.12)',
                    }}
                    wrapperStyle={{ zIndex: 10, pointerEvents: 'none' }}
                  />
                  {balanceOverTime.series.map((series) => (
                    <Area
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      stackId="balance"
                      name={series.label}
                      stroke={series.color}
                      fill={`color-mix(in srgb, ${series.color} 35%, transparent)`}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.4rem 0.75rem',
                justifyContent: 'center',
                fontSize: '0.85rem',
                lineHeight: 1.1,
                marginTop: '0.35rem',
              }}
            >
              {balanceOverTime.series.map((item) => (
                <span
                  key={item.key}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '999px',
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  {item.label}
                </span>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {ordinaryIncomeChart.data.length > 0 ? (
        <div className="card">
          <div className="row">
            <h2>Taxable ordinary income and bracket thresholds</h2>
          <button
            className="link-button"
            type="button"
            onClick={() => setShowOrdinaryChart((current) => !current)}
          >
            {showOrdinaryChart ? '▾' : '▸'} {showOrdinaryChart ? 'Hide' : 'Show'}
          </button>
          </div>
          {showOrdinaryChart ? (
            <>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ordinaryIncomeChart.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1} />
                  <XAxis dataKey="year" />
                  <YAxis
                    tickFormatter={(value) => formatAxisValue(Number(value))}
                    width={70}
                    domain={['dataMin', ordinaryIncomeChart.maxValue]}
                    allowDataOverflow={true}
                  />
                  <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) {
                      return null
                    }
                    const row = payload[0]?.payload as { year?: number; age?: number } | undefined
                    const label = row?.year ? `${row.year} (age ${row.age ?? '-'})` : `${row?.age ?? ''}`
                    return (
                      <div
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          boxShadow: '0 12px 24px rgba(25, 32, 42, 0.12)',
                          padding: '10px 12px',
                        }}
                      >
                        <div className="tooltip-label">{label}</div>
                        {payload.map((entry) => (
                          <div key={String(entry.dataKey)} style={{ color: entry.color }}>
                            {entry.name}: {formatCurrency(Number(entry.value))}
                          </div>
                        ))}
                      </div>
                    )
                  }}
                  wrapperStyle={{ zIndex: 10, pointerEvents: 'none' }}
                />
                  <Area
                    type="monotone"
                    dataKey="standardDeduction"
                    stackId="ordinary"
                    name="Standard deduction"
                    stroke="#64748b"
                    fill="color-mix(in srgb, #64748b 30%, transparent)"
                  />
                  <Area
                    type="monotone"
                    dataKey="ledgerDeductions"
                    stackId="ordinary"
                    name="Other deductions"
                    stroke="#94a3b8"
                    fill="color-mix(in srgb, #94a3b8 30%, transparent)"
                  />
                  <Area
                    type="monotone"
                    dataKey="salaryIncome"
                    stackId="ordinary"
                    name="Salary and other income"
                    stroke="#4f63ff"
                    fill="color-mix(in srgb, #4f63ff 45%, transparent)"
                  />
                  <Area
                    type="monotone"
                    dataKey="investmentIncome"
                    stackId="ordinary"
                    name="Investment income"
                    stroke="#3da5ff"
                    fill="color-mix(in srgb, #3da5ff 45%, transparent)"
                  />
                  <Area
                    type="monotone"
                    dataKey="socialSecurityIncome"
                    stackId="ordinary"
                    name="Taxable social security"
                    stroke="#7ecf7a"
                    fill="color-mix(in srgb, #7ecf7a 45%, transparent)"
                  />
                  <Area
                    type="monotone"
                    dataKey="pensionIncome"
                    stackId="ordinary"
                    name="Taxable pension and annuity"
                    stroke="#7d6bff"
                    fill="color-mix(in srgb, #7d6bff 45%, transparent)"
                  />
                  <Area
                    type="monotone"
                    dataKey="taxDeferredIncome"
                    stackId="ordinary"
                    name="Withdrawal from tax deferred"
                    stroke="#f39c3d"
                    fill="color-mix(in srgb, #f39c3d 45%, transparent)"
                  />
                  {ordinaryIncomeChart.bracketLines.map((line) => {
                    const rateRatio = Math.min(Math.max(line.rate / 0.5, 0), 1)
                    const hue = 120 - 120 * rateRatio
                    const stroke = `hsl(${hue} 70% 45%)`
                    return (
                      <Line
                        key={line.key}
                        type="monotone"
                        dataKey={line.key}
                        name={line.label}
                        stroke={stroke}
                        strokeDasharray="4 4"
                        strokeWidth={0.75}
                        dot={false}
                      />
                    )
                  })}
                </AreaChart>
              </ResponsiveContainer>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.4rem 0.75rem',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  lineHeight: 1.1,
                  marginTop: '0.35rem',
                }}
              >
                {[
                  { key: 'standardDeduction', label: 'Standard deduction', color: '#64748b' },
                  { key: 'ledgerDeductions', label: 'Other deductions', color: '#94a3b8' },
                  { key: 'salaryIncome', label: 'Salary and other income', color: '#4f63ff' },
                  { key: 'investmentIncome', label: 'Investment income', color: '#3da5ff' },
                  { key: 'socialSecurityIncome', label: 'Taxable social security', color: '#7ecf7a' },
                  { key: 'pensionIncome', label: 'Taxable pension and annuity', color: '#7d6bff' },
                  { key: 'taxDeferredIncome', label: 'Withdrawal from tax deferred', color: '#f39c3d' },
                  ...ordinaryIncomeChart.bracketLines.map((line) => {
                    const rateRatio = Math.min(Math.max(line.rate / 0.5, 0), 1)
                    const hue = 120 - 120 * rateRatio
                    return { key: line.key, label: line.label, color: `hsl(${hue} 70% 45%)` }
                  }),
                ].map((item) => (
                  <span key={item.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '999px',
                        background: item.color,
                        display: 'inline-block',
                      }}
                    />
                    {item.label}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {cashflowChart.data.length > 0 && cashflowChart.series.length > 0 ? (
        <div className="card">
          <div className="row">
            <h2>Cash flow by module</h2>
            <div className="row" style={{ gap: '0.75rem' }}>
              <label className="field">
                <select
                  value={bucketFilter}
                  onChange={(event) => setBucketFilter(event.target.value)}
                >
                  <option value="all">All buckets</option>
                  <option value="cash">Cash</option>
                  <option value="taxable">Taxable</option>
                  <option value="traditional">Traditional</option>
                  <option value="roth">Roth</option>
                  <option value="hsa">HSA</option>
                </select>
              </label>
              <button
                className="link-button"
                type="button"
                onClick={() => setShowCashflowChart((current) => !current)}
              >
                {showCashflowChart ? '▾' : '▸'} {showCashflowChart ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {showCashflowChart ? (
            <>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashflowChart.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1.5} />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value) => formatAxisValue(Number(value))} width={70} />
                  <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) {
                      return null
                    }
                    const row = payload[0]?.payload as Record<string, number> | undefined
                    if (!row) {
                      return null
                    }
                    const header =
                      typeof row.year === 'number'
                        ? `${row.year} (age ${row.age ?? '-'})`
                        : `${row.age ?? ''}`
                    return (
                      <div
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          boxShadow: '0 12px 24px rgba(25, 32, 42, 0.12)',
                          padding: '10px 12px',
                        }}
                      >
                        <div className="tooltip-label">{header}</div>
                        {(() => {
                          const visible = visibleCashflowSeries.filter((series) => {
                            if (hiddenSeries.has(series.key)) {
                              return false
                            }
                            const value = row[series.key]
                            return typeof value === 'number' && Math.abs(value) > 0.005
                          })
                          const positives = visible.filter(
                            (series) => Number(row[series.key]) > 0,
                          )
                          const negatives = visible.filter(
                            (series) => Number(row[series.key]) < 0,
                          )
                          return [...positives.reverse(), ...negatives].map((series) => (
                            <div key={series.key} style={{ color: series.color }}>
                              {series.label}: {formatSignedCurrency(Number(row[series.key]))}
                            </div>
                          ))
                        })()}
                      </div>
                    )
                  }}
                  wrapperStyle={{ zIndex: 10, pointerEvents: 'none' }}
                />
                {visibleCashflowSeries.map((series) => (
                  <Fragment key={series.key}>
                    <Area
                      type="monotone"
                      dataKey={`${series.key}__pos`}
                      name={series.label}
                      stroke={series.color}
                      strokeWidth={1.25}
                      fill={`color-mix(in srgb, ${series.color} 45%, transparent)`}
                      fillOpacity={0.85}
                      dot={false}
                      stackId="cashflow-pos"
                      hide={hiddenSeries.has(series.key)}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey={`${series.key}__neg`}
                      name={series.label}
                      stroke={series.color}
                      strokeWidth={1.25}
                      fill={`color-mix(in srgb, ${series.color} 45%, transparent)`}
                      fillOpacity={0.85}
                      dot={false}
                      stackId="cashflow-neg"
                      hide={hiddenSeries.has(series.key)}
                      isAnimationActive={false}
                    />
                  </Fragment>
                ))}
              </AreaChart>
            </ResponsiveContainer>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.45rem 0.75rem',
                fontSize: '0.85rem',
                lineHeight: 1.1,
                justifyContent: 'center',
                marginTop: '0.35rem',
              }}
            >
              {visibleCashflowSeries.map((series) => {
                const isHidden = hiddenSeries.has(series.key)
                return (
                  <button
                    key={series.key}
                    type="button"
                    onClick={() =>
                      setHiddenSeries((current) => {
                        const next = new Set(current)
                        if (next.has(series.key)) {
                          next.delete(series.key)
                        } else {
                          next.add(series.key)
                        }
                        return next
                      })
                    }
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      border: 'none',
                      background: 'none',
                      padding: '0.1rem 0',
                      color: isHidden ? 'var(--text-muted)' : 'inherit',
                      opacity: isHidden ? 0.55 : 1,
                      cursor: 'pointer',
                      font: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '999px',
                        background: series.color,
                        display: 'inline-block',
                      }}
                    />
                    {series.label}
                  </button>
                )
              })}
            </div>
          </>) : null}
        </div>
      ) : null}

      <div className="card stack">
        <h2>Summary</h2>
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
            <span className="muted">Max balance</span>
            <strong>{formatCurrency(summary.maxBalance)}</strong>
          </div>
        </div>
      </div>

      <div className="card stack">
        <h2>Timeline</h2>
        <table className="table selectable">
          <thead>
            <tr>
              <th>Start date</th>
              <th>Age (end of year)</th>
              <th>Balance</th>
              <th>Contribution</th>
              <th>Spending</th>
            </tr>
          </thead>
          <tbody>
            {filteredTimeline.map((point) => {
              const monthRows = monthlyByYear.get(point.yearIndex) ?? []
              const yearMode = getYearDetailMode(point.yearIndex)
              const yearMonthEntries = monthRows.flatMap((month) => {
                const explanation = explanationsByMonth.get(month.monthIndex)
                return explanation ? [{ month, explanation }] : []
              })
              const yearStartMonth = monthRows.length > 0 ? monthRows[0] : null
              const yearEndMonth = monthRows.length > 0 ? monthRows[monthRows.length - 1] : null
              const yearEndExplanation = yearEndMonth
                ? explanationsByMonth.get(yearEndMonth.monthIndex)
                : undefined
              const priorYearMonths =
                point.yearIndex > 0 ? monthlyByYear.get(point.yearIndex - 1) ?? [] : []
              const priorYearEndMonth =
                priorYearMonths.length > 0 ? priorYearMonths[priorYearMonths.length - 1] : null
              const priorYearEndExplanation = priorYearEndMonth
                ? explanationsByMonth.get(priorYearEndMonth.monthIndex)
                : undefined
              const yearModules = new Map<
                string,
                {
                  moduleId: string
                  hasActivity: boolean
                  months: Array<{
                    month: (typeof monthRows)[number]
                    module: (typeof yearMonthEntries)[number]['explanation']['modules'][number]
                  }>
                  totals: {
                    cash: number
                    ordinaryIncome: number
                    capitalGains: number
                    deductions: number
                    taxExemptIncome: number
                    deposit: number
                    withdraw: number
                    convert: number
                    market: number
                    hasMarket: boolean
                  }
                }
              >()
              yearMonthEntries.forEach(({ month, explanation }) => {
                explanation.modules.forEach((module) => {
                  const hasActivity =
                    module.cashflows.length > 0 ||
                    module.actions.length > 0 ||
                    (module.marketReturns?.length ?? 0) > 0
                  const entry = yearModules.get(module.moduleId) ?? {
                    moduleId: module.moduleId,
                    hasActivity: false,
                    months: [],
                    totals: {
                      cash: 0,
                      ordinaryIncome: 0,
                      capitalGains: 0,
                      deductions: 0,
                      taxExemptIncome: 0,
                      deposit: 0,
                      withdraw: 0,
                      convert: 0,
                      market: 0,
                      hasMarket: false,
                    },
                  }
                  entry.totals.cash += module.totals.cashflows.cash
                  entry.totals.ordinaryIncome += module.totals.cashflows.ordinaryIncome
                  entry.totals.capitalGains += module.totals.cashflows.capitalGains
                  entry.totals.deductions += module.totals.cashflows.deductions
                  entry.totals.taxExemptIncome += module.totals.cashflows.taxExemptIncome
                  entry.totals.deposit += module.totals.actions.deposit
                  entry.totals.withdraw += module.totals.actions.withdraw
                  entry.totals.convert += module.totals.actions.convert
                  if (module.totals.market) {
                    entry.totals.market += module.totals.market.total
                    entry.totals.hasMarket = true
                  }
                  if (hasActivity) {
                    entry.hasActivity = true
                    entry.months.push({ month, module })
                  }
                  yearModules.set(module.moduleId, entry)
                })
              })
              const yearModuleRows = [...yearModules.values()]
                .filter((entry) => {
                  if (entry.hasActivity) {
                    return true
                  }
                  const totals = entry.totals
                  return (
                    totals.cash !== 0 ||
                    totals.ordinaryIncome !== 0 ||
                    totals.capitalGains !== 0 ||
                    totals.deductions !== 0 ||
                    totals.taxExemptIncome !== 0 ||
                    totals.deposit !== 0 ||
                    totals.withdraw !== 0 ||
                    totals.convert !== 0 ||
                    totals.market !== 0
                  )
                })
                .sort((a, b) =>
                  (moduleLabels[a.moduleId] ?? a.moduleId).localeCompare(
                    moduleLabels[b.moduleId] ?? b.moduleId,
                  ),
                )
              return (
                <Fragment key={point.yearIndex}>
                  <tr>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                          <button
                            type="button"
                            title="No detail"
                            aria-label="No detail"
                            onClick={() =>
                              setYearDetailModes((current) => ({
                                ...current,
                                [point.yearIndex]:
                                  current[point.yearIndex] === 'none' ? 'none' : 'none',
                              }))
                            }
                            style={detailButtonStyle(yearMode === 'none')}
                          >
                            <CancelIcon />
                          </button>
                          <button
                            type="button"
                            title="Month detail"
                            aria-label="Month detail"
                            onClick={() =>
                              setYearDetailModes((current) => ({
                                ...current,
                                [point.yearIndex]:
                                  current[point.yearIndex] === 'month' ? 'none' : 'month',
                              }))
                            }
                            style={detailButtonStyle(yearMode === 'month')}
                          >
                            <CalendarIcon />
                          </button>
                          <button
                            type="button"
                            title="Module detail"
                            aria-label="Module detail"
                            onClick={() =>
                              setYearDetailModes((current) => ({
                                ...current,
                                [point.yearIndex]:
                                  current[point.yearIndex] === 'module' ? 'none' : 'module',
                              }))
                            }
                            style={detailButtonStyle(yearMode === 'module')}
                          >
                            <PieIcon />
                          </button>
                        </div>
                        <span>{point.date ? addMonths(point.date, -11) ?? '-' : '-'}</span>
                      </div>
                    </td>
                    <td>{point.age}</td>
                    <td>{formatCurrencyForDate(point.balance, point.date)}</td>
                    <td>{formatCurrencyForDate(point.contribution, point.date)}</td>
                    <td>{formatCurrencyForDate(point.spending, point.date)}</td>
                  </tr>
                  {yearMode === 'module' ? (
                    <tr className="table-row-highlight">
                      <td colSpan={5} className="expansion">
                        <div className="stack">
                          <div className="stack">
                            <strong>Module activity</strong>
                            <div className="table-wrap">
                              <table className="table compact selectable">
                                <thead>
                                  <tr>
                                    <th>Module</th>
                                    <th>Cash</th>
                                    <th>Ord inc</th>
                                    <th>Cap gains</th>
                                    <th>Deductions</th>
                                    <th>Tax exempt</th>
                                    <th>Deposit</th>
                                    <th>Withdraw</th>
                                    <th>Convert</th>
                                    <th>Market</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {yearModuleRows.map((module) => {
                                    const moduleKey = `year:${point.yearIndex}:${module.moduleId}`
                                    const moduleExpanded = expandedModules.has(moduleKey)
                                    const totals = module.totals
                                    return (
                                      <Fragment key={moduleKey}>
                                        <tr
                                          onClick={() =>
                                            setExpandedModules((current) => {
                                              const next = new Set(current)
                                              if (next.has(moduleKey)) {
                                                next.delete(moduleKey)
                                              } else {
                                                next.add(moduleKey)
                                              }
                                              return next
                                            })
                                          }
                                        >
                                          <td>
                                            <span className="muted" aria-hidden="true">
                                              {moduleExpanded ? '▾' : '▸'}
                                            </span>{' '}
                                            {moduleLabels[module.moduleId] ?? module.moduleId}
                                          </td>
                                          <td>
                                            {formatSignedCurrencyForDate(totals.cash, point.date)}
                                          </td>
                                          <td>
                                            {formatSignedCurrencyForDate(
                                              totals.ordinaryIncome,
                                              point.date,
                                            )}
                                          </td>
                                          <td>
                                            {formatSignedCurrencyForDate(
                                              totals.capitalGains,
                                              point.date,
                                            )}
                                          </td>
                                          <td>
                                            {formatSignedCurrencyForDate(
                                              totals.deductions,
                                              point.date,
                                            )}
                                          </td>
                                          <td>
                                            {formatSignedCurrencyForDate(
                                              totals.taxExemptIncome,
                                              point.date,
                                            )}
                                          </td>
                                          <td>
                                            {formatSignedCurrencyForDate(
                                              totals.deposit,
                                              point.date,
                                            )}
                                          </td>
                                          <td>
                                            {formatSignedCurrencyForDate(
                                              totals.withdraw,
                                              point.date,
                                            )}
                                          </td>
                                          <td>
                                            {formatSignedCurrencyForDate(
                                              totals.convert,
                                              point.date,
                                            )}
                                          </td>
                                          <td>
                                            {totals.hasMarket
                                              ? formatSignedCurrencyForDate(
                                                  totals.market,
                                                  point.date,
                                                )
                                              : '-'}
                                          </td>
                                        </tr>
                                        {moduleExpanded ? (
                                          <tr>
                                            <td colSpan={10} className="expansion">
                                              <div className="stack">
                                                {(() => {
                                                  const months = [...module.months].sort(
                                                    (a, b) =>
                                                      a.month.monthIndex - b.month.monthIndex,
                                                  )
                                                  const inputLabels = new Set<string>()
                                                  const checkpointLabels = new Set<string>()
                                                  months.forEach((entry) => {
                                                    entry.module.inputs?.forEach((input) => {
                                                      inputLabels.add(input.label)
                                                    })
                                                    entry.module.checkpoints?.forEach((checkpoint) => {
                                                      checkpointLabels.add(checkpoint.label)
                                                    })
                                                  })
                                                  const inputRows = Array.from(inputLabels)
                                                  const checkpointRows = Array.from(checkpointLabels)
                                                  const cashflowRows = months.flatMap((entry) =>
                                                    entry.module.cashflows.map((flow) => ({
                                                      month: entry.month,
                                                      flow,
                                                    })),
                                                  )
                                                  const actionRows = months.flatMap((entry) =>
                                                    entry.module.actions.map((action) => ({
                                                      month: entry.month,
                                                      action,
                                                    })),
                                                  )
                                                  const marketRows = months.flatMap((entry) =>
                                                    (entry.module.marketReturns ?? []).map((item) => ({
                                                      month: entry.month,
                                                      item,
                                                    })),
                                                  )
                                                  return (
                                                    <>
                                                      {inputRows.length > 0 ? (
                                                        <div className="stack">
                                                          <strong className="muted">Inputs</strong>
                                                          <div className="table-wrap">
                                                            <table className="table compact">
                                                              <thead>
                                                                <tr>
                                                                  <th>Metric</th>
                                                                  {months.map((entry) => (
                                                                    <th key={entry.month.monthIndex}>
                                                                      {entry.month.date}
                                                                    </th>
                                                                  ))}
                                                                </tr>
                                                              </thead>
                                                              <tbody>
                                                                {inputRows.map((label) => (
                                                                  <tr key={label}>
                                                                    <td className="muted">{label}</td>
                                                                    {months.map((entry) => {
                                                                      const value =
                                                                        entry.module.inputs?.find(
                                                                          (input) =>
                                                                            input.label === label,
                                                                        )?.value
                                                                      return (
                                                                        <td key={entry.month.monthIndex}>
                                                                          {formatMetricValue(value)}
                                                                        </td>
                                                                      )
                                                                    })}
                                                                  </tr>
                                                                ))}
                                                              </tbody>
                                                            </table>
                                                          </div>
                                                        </div>
                                                      ) : null}
                                                      {checkpointRows.length > 0 ? (
                                                        <div className="stack">
                                                          <strong className="muted">Checkpoints</strong>
                                                          <div className="table-wrap">
                                                            <table className="table compact">
                                                              <thead>
                                                                <tr>
                                                                  <th>Metric</th>
                                                                  {months.map((entry) => (
                                                                    <th key={entry.month.monthIndex}>
                                                                      {entry.month.date}
                                                                    </th>
                                                                  ))}
                                                                </tr>
                                                              </thead>
                                                              <tbody>
                                                                {checkpointRows.map((label) => (
                                                                  <tr key={label}>
                                                                    <td className="muted">{label}</td>
                                                                    {months.map((entry) => {
                                                                      const value =
                                                                        entry.module.checkpoints?.find(
                                                                          (checkpoint) =>
                                                                            checkpoint.label === label,
                                                                        )?.value
                                                                      return (
                                                                        <td key={entry.month.monthIndex}>
                                                                          {formatMetricValue(value)}
                                                                        </td>
                                                                      )
                                                                    })}
                                                                  </tr>
                                                                ))}
                                                              </tbody>
                                                            </table>
                                                          </div>
                                                        </div>
                                                      ) : null}
                                                      {cashflowRows.length > 0 ? (
                                                        <div className="stack">
                                                          <strong className="muted">Cashflows</strong>
                                                          <div className="table-wrap">
                                                            <table className="table compact">
                                                              <thead>
                                                                <tr>
                                                                  <th>Month</th>
                                                                  <th>Label</th>
                                                                  <th>Category</th>
                                                                  <th>Cash</th>
                                                                  <th>Ord inc</th>
                                                                  <th>Cap gains</th>
                                                                  <th>Deductions</th>
                                                                  <th>Tax exempt</th>
                                                                </tr>
                                                              </thead>
                                                              <tbody>
                                                                {cashflowRows.map(({ month, flow }) => (
                                                                  <tr key={`${month.monthIndex}-${flow.id}`}>
                                                                    <td>{month.date}</td>
                                                                    <td>{flow.label}</td>
                                                                    <td className="muted">{flow.category}</td>
                                                                    <td>
                                                                      {formatSignedCurrencyForDate(
                                                                        flow.cash,
                                                                        month.date,
                                                                      )}
                                                                    </td>
                                                                    <td>
                                                                      {formatSignedCurrencyForDate(
                                                                        flow.ordinaryIncome ?? 0,
                                                                        month.date,
                                                                      )}
                                                                    </td>
                                                                    <td>
                                                                      {formatSignedCurrencyForDate(
                                                                        flow.capitalGains ?? 0,
                                                                        month.date,
                                                                      )}
                                                                    </td>
                                                                    <td>
                                                                      {formatSignedCurrencyForDate(
                                                                        flow.deductions ?? 0,
                                                                        month.date,
                                                                      )}
                                                                    </td>
                                                                    <td>
                                                                      {formatSignedCurrencyForDate(
                                                                        flow.taxExemptIncome ?? 0,
                                                                        month.date,
                                                                      )}
                                                                    </td>
                                                                  </tr>
                                                                ))}
                                                              </tbody>
                                                            </table>
                                                          </div>
                                                        </div>
                                                      ) : null}
                                                      {actionRows.length > 0 ? (
                                                        <div className="stack">
                                                          <strong className="muted">Actions</strong>
                                                          <div className="table-wrap">
                                                            <table className="table compact">
                                                              <thead>
                                                                <tr>
                                                                  <th>Month</th>
                                                                  <th>Label</th>
                                                                  <th>Kind</th>
                                                                  <th>Amount</th>
                                                                  <th>Resolved</th>
                                                                  <th>Source</th>
                                                                  <th>Target</th>
                                                                </tr>
                                                              </thead>
                                                              <tbody>
                                                                {actionRows.map(({ month, action }) => (
                                                                  <tr key={`${month.monthIndex}-${action.id}`}>
                                                                    <td>{month.date}</td>
                                                                    <td>{action.label ?? action.id}</td>
                                                                    <td className="muted">{action.kind}</td>
                                                                    <td>
                                                                      {formatSignedCurrencyForDate(
                                                                        action.amount,
                                                                        month.date,
                                                                      )}
                                                                    </td>
                                                                    <td>
                                                                      {formatSignedCurrencyForDate(
                                                                        action.resolvedAmount,
                                                                        month.date,
                                                                      )}
                                                                    </td>
                                                                    <td className="muted">
                                                                      {action.sourceHoldingId
                                                                        ? getHoldingLabel(
                                                                            action.sourceHoldingId,
                                                                          )
                                                                        : '-'}
                                                                    </td>
                                                                    <td className="muted">
                                                                      {action.targetHoldingId
                                                                        ? getHoldingLabel(
                                                                            action.targetHoldingId,
                                                                          )
                                                                        : '-'}
                                                                    </td>
                                                                  </tr>
                                                                ))}
                                                              </tbody>
                                                            </table>
                                                          </div>
                                                        </div>
                                                      ) : null}
                                                      {marketRows.length > 0 ? (
                                                        <div className="stack">
                                                          <strong className="muted">Market returns</strong>
                                                          <div className="table-wrap">
                                                            <table className="table compact">
                                                              <thead>
                                                                <tr>
                                                                  <th>Month</th>
                                                                  <th>Account</th>
                                                                  <th>Start</th>
                                                                  <th>End</th>
                                                                  <th>Change</th>
                                                                  <th>Rate</th>
                                                                </tr>
                                                              </thead>
                                                              <tbody>
                                                                {marketRows.map(({ month, item }) => (
                                                                  <tr key={`${month.monthIndex}-${item.id}`}>
                                                                    <td>{month.date}</td>
                                                                    <td>
                                                                      {item.kind === 'cash'
                                                                        ? accountLookup.cashById.get(item.id) ??
                                                                          item.id
                                                                        : getHoldingLabel(item.id)}
                                                                    </td>
                                                                    <td>
                                                                      {formatSignedCurrencyForDate(
                                                                        item.balanceStart,
                                                                        month.date,
                                                                      )}
                                                                    </td>
                                                                    <td>
                                                                      {formatSignedCurrencyForDate(
                                                                        item.balanceEnd,
                                                                        month.date,
                                                                      )}
                                                                    </td>
                                                                    <td>
                                                                      {formatSignedCurrencyForDate(
                                                                        item.amount,
                                                                        month.date,
                                                                      )}
                                                                    </td>
                                                                    <td>{formatRate(item.rate)}</td>
                                                                  </tr>
                                                                ))}
                                                              </tbody>
                                                            </table>
                                                          </div>
                                                        </div>
                                                      ) : null}
                                                    </>
                                                  )
                                                })()}
                                              </div>
                                            </td>
                                          </tr>
                                        ) : null}
                                      </Fragment>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <div className="stack">
                            <strong>Year ledger</strong>
                            <div className="table-wrap">
                              {point.ledger ? (
                                <table className="table compact">
                                  <tbody>
                                    <tr>
                                      <td className="muted">Ordinary income</td>
                                      <td>
                                        {formatSignedCurrencyForDate(
                                          point.ledger.ordinaryIncome,
                                          point.date,
                                        )}
                                      </td>
                                    </tr>
                                    <tr>
                                      <td className="muted">Capital gains</td>
                                      <td>
                                        {formatSignedCurrencyForDate(
                                          point.ledger.capitalGains,
                                          point.date,
                                        )}
                                      </td>
                                    </tr>
                                    <tr>
                                      <td className="muted">Deductions</td>
                                      <td>
                                        {formatSignedCurrencyForDate(
                                          point.ledger.deductions,
                                          point.date,
                                        )}
                                      </td>
                                    </tr>
                                    <tr>
                                      <td className="muted">Tax exempt income</td>
                                      <td>
                                        {formatSignedCurrencyForDate(
                                          point.ledger.taxExemptIncome,
                                          point.date,
                                        )}
                                      </td>
                                    </tr>
                                    <tr>
                                      <td className="muted">Social Security benefits</td>
                                      <td>
                                        {formatSignedCurrencyForDate(
                                          point.ledger.socialSecurityBenefits ?? 0,
                                          point.date,
                                        )}
                                      </td>
                                    </tr>
                                    <tr>
                                      <td className="muted">Penalties</td>
                                      <td>
                                        {formatSignedCurrencyForDate(
                                          point.ledger.penalties,
                                          point.date,
                                        )}
                                      </td>
                                    </tr>
                                    <tr>
                                      <td className="muted">Tax paid</td>
                                      <td>
                                        {formatSignedCurrencyForDate(
                                          point.ledger.taxPaid,
                                          point.date,
                                        )}
                                      </td>
                                    </tr>
                                    <tr>
                                      <td className="muted">Earned income</td>
                                      <td>
                                        {formatSignedCurrencyForDate(
                                          point.ledger.earnedIncome,
                                          point.date,
                                        )}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              ) : (
                                <p className="muted">No year ledger data available.</p>
                              )}
                            </div>
                          </div>
                          <div className="stack">
                            <strong>Account balances</strong>
                            <div className="table-wrap">
                              {yearEndExplanation ? (
                                <table className="table compact">
                                  <thead>
                                    <tr>
                                      <th>Account</th>
                                      <th>Prior</th>
                                      <th>Current</th>
                                      <th>Change</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {yearEndExplanation.accounts.map((account) => {
                                      const priorBalance = priorYearEndExplanation
                                        ? priorYearEndExplanation.accounts.find(
                                            (entry) =>
                                              entry.id === account.id &&
                                              entry.kind === account.kind,
                                          )?.balance
                                        : point.yearIndex === 0
                                          ? initialBalances.get(
                                              `${account.kind}:${account.id}`,
                                            )
                                          : undefined
                                      const priorDate =
                                        priorYearEndExplanation?.date ?? yearStartMonth?.date
                                      const adjustedPrior =
                                        priorBalance !== undefined
                                          ? adjustForInflation(priorBalance, priorDate)
                                          : undefined
                                      const adjustedCurrent = adjustForInflation(
                                        account.balance,
                                        yearEndMonth?.date,
                                      )
                                      const delta =
                                        adjustedPrior !== undefined
                                          ? adjustedCurrent - adjustedPrior
                                          : null
                                      return (
                                        <tr key={`${account.kind}-${account.id}`}>
                                          <td>{getAccountLabel(account)}</td>
                                          <td>
                                            {adjustedPrior !== undefined
                                              ? formatSignedCurrency(adjustedPrior)
                                              : '-'}
                                          </td>
                                          <td>{formatSignedCurrency(adjustedCurrent)}</td>
                                          <td>
                                            {delta === null
                                              ? '-'
                                              : formatSignedCurrency(delta)}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              ) : (
                                <p className="muted">No account balance data available.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {yearMode === 'month'
                    ? monthRows.map((month) => {
                        const monthExpanded = expandedMonths.has(month.monthIndex)
                        const explanation = explanationsByMonth.get(month.monthIndex)
                        const priorExplanation =
                          month.monthIndex > 0
                            ? explanationsByMonth.get(month.monthIndex - 1)
                            : undefined
                        return (
                          <Fragment key={`${point.yearIndex}-${month.monthIndex}`}>
                            <tr
                              onClick={() =>
                                setExpandedMonths((current) => {
                                  const next = new Set(current)
                                  if (next.has(month.monthIndex)) {
                                    next.delete(month.monthIndex)
                                  } else {
                                    next.add(month.monthIndex)
                                  }
                                  return next
                                })
                              }
                            >
                              <td className="muted">
                                <span className="muted" aria-hidden="true">
                                  {monthExpanded ? '▾' : '▸'}
                                </span>{' '}
                                {month.date}
                              </td>
                              <td className="muted">{month.age}</td>
                              <td className="muted">
                                {formatCurrencyForDate(month.totalBalance, month.date)}
                              </td>
                              <td className="muted">
                                {formatCurrencyForDate(month.contributions, month.date)}
                              </td>
                              <td className="muted">
                                {formatCurrencyForDate(month.spending, month.date)}
                              </td>
                            </tr>
                            {monthExpanded ? (
                              <tr className="table-row-highlight">
                                <td colSpan={5} className="expansion">
                                  <div className="stack">
                                    {explanation ? (
                                      <>
                                        <div className="stack">
                                          <strong>Module activity</strong>
                                          <div className="table-wrap">
                                            <table className="table compact selectable">
                                              <thead>
                                                <tr>
                                                  <th>Module</th>
                                                  <th>Cash</th>
                                                  <th>Ord inc</th>
                                                  <th>Cap gains</th>
                                                  <th>Deductions</th>
                                                  <th>Tax exempt</th>
                                                  <th>Deposit</th>
                                                  <th>Withdraw</th>
                                                  <th>Convert</th>
                                                  <th>Market</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {explanation.modules
                                                  .filter((module) => {
                                                    const totals = module.totals
                                                    const cashflows = totals.cashflows
                                                    const actions = totals.actions
                                                    const marketTotal = totals.market?.total ?? 0
                                                    const hasActivity =
                                                      module.cashflows.length > 0 ||
                                                      module.actions.length > 0 ||
                                                      (module.marketReturns?.length ?? 0) > 0
                                                    return (
                                                      hasActivity ||
                                                      cashflows.cash !== 0 ||
                                                      cashflows.ordinaryIncome !== 0 ||
                                                      cashflows.capitalGains !== 0 ||
                                                      cashflows.deductions !== 0 ||
                                                      cashflows.taxExemptIncome !== 0 ||
                                                      actions.deposit !== 0 ||
                                                      actions.withdraw !== 0 ||
                                                      actions.convert !== 0 ||
                                                      marketTotal !== 0
                                                    )
                                                  })
                                                  .map((module) => {
                                                  const moduleKey = `${month.monthIndex}:${module.moduleId}`
                                                  const moduleExpanded = expandedModules.has(moduleKey)
                                                  return (
                                                    <Fragment key={moduleKey}>
                                                      <tr
                                                        onClick={() =>
                                                          setExpandedModules((current) => {
                                                            const next = new Set(current)
                                                            if (next.has(moduleKey)) {
                                                              next.delete(moduleKey)
                                                            } else {
                                                              next.add(moduleKey)
                                                            }
                                                            return next
                                                          })
                                                        }
                                                      >
                                                        <td>
                                                          <span className="muted" aria-hidden="true">
                                                            {moduleExpanded ? '▾' : '▸'}
                                                          </span>{' '}
                                                          {moduleLabels[module.moduleId] ?? module.moduleId}
                                                        </td>
                                                        <td>
                                                          {formatSignedCurrencyForDate(
                                                            module.totals.cashflows.cash,
                                                            month.date,
                                                          )}
                                                        </td>
                                                        <td>
                                                          {formatSignedCurrencyForDate(
                                                            module.totals.cashflows.ordinaryIncome,
                                                            month.date,
                                                          )}
                                                        </td>
                                                        <td>
                                                          {formatSignedCurrencyForDate(
                                                            module.totals.cashflows.capitalGains,
                                                            month.date,
                                                          )}
                                                        </td>
                                                        <td>
                                                          {formatSignedCurrencyForDate(
                                                            module.totals.cashflows.deductions,
                                                            month.date,
                                                          )}
                                                        </td>
                                                        <td>
                                                          {formatSignedCurrencyForDate(
                                                            module.totals.cashflows.taxExemptIncome,
                                                            month.date,
                                                          )}
                                                        </td>
                                                        <td>
                                                          {formatSignedCurrencyForDate(
                                                            module.totals.actions.deposit,
                                                            month.date,
                                                          )}
                                                        </td>
                                                        <td>
                                                          {formatSignedCurrencyForDate(
                                                            module.totals.actions.withdraw,
                                                            month.date,
                                                          )}
                                                        </td>
                                                        <td>
                                                          {formatSignedCurrencyForDate(
                                                            module.totals.actions.convert,
                                                            month.date,
                                                          )}
                                                        </td>
                                                        <td>
                                                          {module.totals.market
                                                            ? formatSignedCurrencyForDate(
                                                                module.totals.market.total,
                                                                month.date,
                                                              )
                                                            : '-'}
                                                        </td>
                                                      </tr>
                                                      {moduleExpanded ? (
                                                        <tr>
                                                          <td colSpan={10} className="expansion">
                                                            <div className="stack">
                                                              {module.inputs ? (
                                                                <div className="stack">
                                                                  <strong className="muted">Inputs</strong>
                                                                  <table className="table compact">
                                                                    <tbody>
                                                                      {module.inputs.map((input) => (
                                                                        <tr key={input.label}>
                                                                          <td className="muted">{input.label}</td>
                                                                          <td>{formatMetricValue(input.value)}</td>
                                                                        </tr>
                                                                      ))}
                                                                    </tbody>
                                                                  </table>
                                                                </div>
                                                              ) : null}
                                                              {module.checkpoints ? (
                                                                <div className="stack">
                                                                  <strong className="muted">Checkpoints</strong>
                                                                  <table className="table compact">
                                                                    <tbody>
                                                                      {module.checkpoints.map((checkpoint) => (
                                                                        <tr key={checkpoint.label}>
                                                                          <td className="muted">{checkpoint.label}</td>
                                                                          <td>
                                                                            {formatMetricValue(checkpoint.value)}
                                                                          </td>
                                                                        </tr>
                                                                      ))}
                                                                    </tbody>
                                                                  </table>
                                                                </div>
                                                              ) : null}
                                                              {module.cashflows.length > 0 ? (
                                                                <div className="stack">
                                                                  <strong className="muted">Cashflows</strong>
                                                                  <div className="table-wrap">
                                                                    <table className="table compact">
                                                                      <thead>
                                                                        <tr>
                                                                          <th>Label</th>
                                                                          <th>Category</th>
                                                                          <th>Cash</th>
                                                                          <th>Ord inc</th>
                                                                          <th>Cap gains</th>
                                                                          <th>Deductions</th>
                                                                          <th>Tax exempt</th>
                                                                        </tr>
                                                                      </thead>
                                                                      <tbody>
                                                                        {module.cashflows.map((flow) => (
                                                                          <tr key={flow.id}>
                                                                            <td>{flow.label}</td>
                                                                            <td className="muted">{flow.category}</td>
                                                                            <td>
                                                                              {formatSignedCurrencyForDate(
                                                                                flow.cash,
                                                                                month.date,
                                                                              )}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrencyForDate(
                                                                                flow.ordinaryIncome ?? 0,
                                                                                month.date,
                                                                              )}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrencyForDate(
                                                                                flow.capitalGains ?? 0,
                                                                                month.date,
                                                                              )}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrencyForDate(
                                                                                flow.deductions ?? 0,
                                                                                month.date,
                                                                              )}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrencyForDate(
                                                                                flow.taxExemptIncome ?? 0,
                                                                                month.date,
                                                                              )}
                                                                            </td>
                                                                          </tr>
                                                                        ))}
                                                                      </tbody>
                                                                    </table>
                                                                  </div>
                                                                </div>
                                                              ) : null}
                                                              {module.actions.length > 0 ? (
                                                                <div className="stack">
                                                                  <strong className="muted">Actions</strong>
                                                                  <div className="table-wrap">
                                                                    <table className="table compact">
                                                                      <thead>
                                                                        <tr>
                                                                          <th>Label</th>
                                                                          <th>Kind</th>
                                                                          <th>Amount</th>
                                                                          <th>Resolved</th>
                                                                          <th>Source</th>
                                                                          <th>Target</th>
                                                                        </tr>
                                                                      </thead>
                                                                      <tbody>
                                                                        {module.actions.map((action) => (
                                                                          <tr key={action.id}>
                                                                            <td>{action.label ?? action.id}</td>
                                                                            <td className="muted">{action.kind}</td>
                                                                            <td>
                                                                              {formatSignedCurrencyForDate(
                                                                                action.amount,
                                                                                month.date,
                                                                              )}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrencyForDate(
                                                                                action.resolvedAmount,
                                                                                month.date,
                                                                              )}
                                                                            </td>
                                                                            <td className="muted">
                                                                              {action.sourceHoldingId
                                                                                ? getHoldingLabel(action.sourceHoldingId)
                                                                                : '-'}
                                                                            </td>
                                                                            <td className="muted">
                                                                              {action.targetHoldingId
                                                                                ? getHoldingLabel(action.targetHoldingId)
                                                                                : '-'}
                                                                            </td>
                                                                          </tr>
                                                                        ))}
                                                                      </tbody>
                                                                    </table>
                                                                  </div>
                                                                </div>
                                                              ) : null}
                                                              {module.marketReturns?.length ? (
                                                                <div className="stack">
                                                                  <strong className="muted">Market returns</strong>
                                                                  <div className="table-wrap">
                                                                    <table className="table compact">
                                                                      <thead>
                                                                        <tr>
                                                                          <th>Account</th>
                                                                          <th>Start</th>
                                                                          <th>End</th>
                                                                          <th>Change</th>
                                                                          <th>Rate</th>
                                                                        </tr>
                                                                      </thead>
                                                                      <tbody>
                                                                        {module.marketReturns.map((entry) => (
                                                                          <tr key={`${entry.kind}-${entry.id}`}>
                                                                            <td>
                                                                              {entry.kind === 'cash'
                                                                                ? accountLookup.cashById.get(entry.id) ??
                                                                                  entry.id
                                                                                : getHoldingLabel(entry.id)}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrencyForDate(
                                                                                entry.balanceStart,
                                                                                month.date,
                                                                              )}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrencyForDate(
                                                                                entry.balanceEnd,
                                                                                month.date,
                                                                              )}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrencyForDate(
                                                                                entry.amount,
                                                                                month.date,
                                                                              )}
                                                                            </td>
                                                                            <td>{formatRate(entry.rate)}</td>
                                                                          </tr>
                                                                        ))}
                                                                      </tbody>
                                                                    </table>
                                                                  </div>
                                                                </div>
                                                              ) : null}
                                                            </div>
                                                          </td>
                                                        </tr>
                                                      ) : null}
                                                    </Fragment>
                                                  )
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                        <div className="stack">
                                          <strong>Account balances</strong>
                                          <div className="table-wrap">
                                            <table className="table compact">
                                              <thead>
                                                <tr>
                                                  <th>Account</th>
                                                  <th>Prior</th>
                                                  <th>Current</th>
                                                  <th>Change</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {explanation.accounts.map((account) => {
                                                  const priorBalance = priorExplanation
                                                    ? priorExplanation.accounts.find(
                                                        (entry) =>
                                                          entry.id === account.id &&
                                                          entry.kind === account.kind,
                                                      )?.balance
                                                    : month.monthIndex === 0
                                                      ? initialBalances.get(
                                                          `${account.kind}:${account.id}`,
                                                        )
                                                      : undefined
                                                  const priorDate = priorExplanation?.date
                                                  const adjustedPrior =
                                                    priorBalance !== undefined
                                                      ? adjustForInflation(priorBalance, priorDate)
                                                      : undefined
                                                  const adjustedCurrent = adjustForInflation(
                                                    account.balance,
                                                    month.date,
                                                  )
                                                  const delta =
                                                    adjustedPrior !== undefined
                                                      ? adjustedCurrent - adjustedPrior
                                                      : null
                                                  return (
                                                    <tr key={`${account.kind}-${account.id}`}>
                                                      <td>{getAccountLabel(account)}</td>
                                                      <td>
                                                        {adjustedPrior !== undefined
                                                          ? formatSignedCurrency(adjustedPrior)
                                                          : '-'}
                                                      </td>
                                                      <td>{formatSignedCurrency(adjustedCurrent)}</td>
                                                      <td>
                                                        {delta === null ? '-' : formatSignedCurrency(delta)}
                                                      </td>
                                                    </tr>
                                                  )
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      </>
                                    ) : (
                                      <p className="muted">No explanation data available.</p>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })
                    : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default RunResultsPage
