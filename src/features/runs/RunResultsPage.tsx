import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import type { SimulationRun } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import { subscribeStochasticProgress } from '../../core/simClient/stochasticProgress'
import PageHeader from '../../components/PageHeader'
import RunResultsGraphs from './RunResultsGraphs'
import RunResultsTimeline from './RunResultsTimeline'
import RunResultsDistributions from './RunResultsDistributions'
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
  const [run, setRun] = useState<SimulationRun | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [showPresentDay, setShowPresentDay] = useState(true)
  const [rangeKey, setRangeKey] = useState('all')
  const [balanceDetail, setBalanceDetail] = useState<BalanceDetail>('none')
  const [showTimeline, setShowTimeline] = useState(false)
  const [liveStochasticProgress, setLiveStochasticProgress] = useState<{
    runId: string
    completed: number
    target: number
    cancelled: boolean
    updatedAt: number
  } | null>(null)

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
  const runStartYear = useMemo(() => {
    const startDate =
      run?.result.timeline?.[0]?.date ?? run?.result.monthlyTimeline?.[0]?.date
    if (!startDate) {
      return null
    }
    const year = new Date(startDate).getFullYear()
    return Number.isNaN(year) ? null : year
  }, [run])
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
    const minBalanceRun = run.result.minBalanceRun
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
  }, [adjustForInflation, explanations, filteredTimeline, getCalendarYearIndex, run])

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
    explanationsByMonth,
    filteredMonthlyTimeline,
    filteredTimeline,
    getCalendarYearIndex,
    run,
  ])

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
  const stochasticPending =
    stochasticTargetResolved > 0 &&
    stochasticCompleted < stochasticTargetResolved &&
    !stochasticCancelled
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

  useEffect(() => {
    if (!id || (!stochasticPending && !needsStochasticSync)) {
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
  }, [id, needsStochasticSync, stochasticPending, storage])

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
    if (filteredTimeline.length === 0) {
      return {
        endingBalance: 0,
        minBalance: 0,
      }
    }
    const balances = filteredTimeline.map((point) =>
      showPresentDay ? adjustForInflation(point.balance, point.date) : point.balance,
    )
    return {
      endingBalance: balances.length > 0 ? balances[balances.length - 1] : 0,
      minBalance: balances.length > 0 ? Math.min(...balances) : 0,
    }
  }, [adjustForInflation, filteredTimeline, run, showPresentDay])

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

      <div className="scenario-layout">
        <div className="stack">
          <div className="card stack" id="section-summary">
            <h2>Summary</h2>
            <div className="stack" style={{ gap: '1rem' }}>
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
          </div>

          <RunResultsDistributions
            stochasticRuns={run.result.stochasticRuns}
            formatAxisValue={formatAxisValue}
            formatCurrency={formatCurrency}
            stochasticTarget={stochasticTargetResolved}
            stochasticCompleted={stochasticCompleted}
            stochasticCancelled={stochasticCancelled}
            onCancelStochastic={stochasticPending ? handleCancelStochastic : undefined}
          />

          <RunResultsGraphs
            balanceDetail={balanceDetail}
            balanceDetailOptions={balanceDetailOptions}
            onBalanceDetailChange={setBalanceDetail}
            balanceOverTime={balanceOverTime}
            ordinaryIncomeChart={ordinaryIncomeChart}
            cashflowChart={cashflowChart}
            formatAxisValue={formatAxisValue}
            formatCurrency={formatCurrency}
            formatSignedCurrency={formatSignedCurrency}
          />

          <div className="timeline-collapsible stack">
            <div className="row">
              <h2>Timeline</h2>
              <button
                className="link-button"
                type="button"
                onClick={() => setShowTimeline((current) => !current)}
              >
                {showTimeline ? 'Hide' : 'Show'}
              </button>
            </div>
            {showTimeline ? (
              <RunResultsTimeline
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
            ) : null}
          </div>
        </div>

        <aside className="scenario-toc" aria-label="Jump to section">
          <div className="stack">
            <span className="muted">Jump to</span>
            <div className="run-results-toc-primary">
              <button
                className="link-button"
                type="button"
                onClick={handleJumpTo('section-summary')}
              >
                Summary
              </button>
              <button
                className="link-button"
                type="button"
                onClick={handleJumpTo('section-distributions')}
              >
                Balance distributions
              </button>
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
              <button
                className="link-button"
                type="button"
                onClick={handleJumpTo('section-timeline')}
              >
                Timeline
              </button>
            </div>
            {timelineDecades.length > 0 ? (
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
