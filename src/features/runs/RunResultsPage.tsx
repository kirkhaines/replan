import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import type { SimulationRun } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import PageHeader from '../../components/PageHeader'
import { selectTaxPolicy } from '../../core/sim/tax'

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

const addMonths = (isoDate: string, months: number) => {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  date.setMonth(date.getMonth() + months)
  return date.toISOString().slice(0, 10)
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

const RunResultsPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const storage = useAppStore((state) => state.storage)
  const [run, setRun] = useState<SimulationRun | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set())
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set())
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [showPresentDay, setShowPresentDay] = useState(false)

  const monthlyTimeline = run?.result.monthlyTimeline ?? []
  const explanations = run?.result.explanations ?? []
  const monthlyByYear = useMemo(() => {
    return monthlyTimeline.reduce<Map<number, typeof monthlyTimeline>>((acc, entry) => {
      const yearIndex = Math.floor(entry.monthIndex / 12)
      const list = acc.get(yearIndex) ?? []
      list.push(entry)
      acc.set(yearIndex, list)
      return acc
    }, new Map())
  }, [monthlyTimeline])
  const explanationsByMonth = useMemo(() => {
    return explanations.reduce<Map<number, (typeof explanations)[number]>>((acc, entry) => {
      acc.set(entry.monthIndex, entry)
      return acc
    }, new Map())
  }, [explanations])
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
  }, [run?.snapshot])
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
  }, [run?.snapshot])

  const baseYear = new Date().getFullYear()
  const cpiRate = run?.snapshot?.scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
  const adjustForInflation = (value: number, dateIso?: string | null) => {
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
  }

  const formatCurrencyForDate = (value: number, dateIso?: string | null) =>
    formatCurrency(adjustForInflation(value, dateIso))
  const formatSignedCurrencyForDate = (value: number, dateIso?: string | null) =>
    formatSignedCurrency(adjustForInflation(value, dateIso))

  const balanceOverTime = useMemo(() => {
    if (!run?.snapshot) {
      return { data: [], seriesKeys: [] }
    }
    const holdingTaxType = new Map(
      run.snapshot.investmentAccountHoldings.map((holding) => [holding.id, holding.taxType]),
    )
    const seriesKeys = ['cash', 'taxable', 'traditional', 'roth', 'hsa'] as const
    const data = run.result.timeline.map((point) => {
      const monthly = monthlyByYear.get(point.yearIndex)
      const lastMonth = monthly && monthly.length > 0 ? monthly[monthly.length - 1] : null
      const accounts = lastMonth
        ? explanationsByMonth.get(lastMonth.monthIndex)?.accounts
        : undefined
      const totals: Record<(typeof seriesKeys)[number], number> = {
        cash: 0,
        taxable: 0,
        traditional: 0,
        roth: 0,
        hsa: 0,
      }
      if (accounts) {
        accounts.forEach((account) => {
          if (account.kind === 'cash') {
            totals.cash += adjustForInflation(account.balance, lastMonth?.date ?? point.date)
            return
          }
          const taxType = holdingTaxType.get(account.id)
          if (taxType) {
            totals[taxType] += adjustForInflation(account.balance, lastMonth?.date ?? point.date)
          }
        })
      }
      return { ...point, ...totals }
    })
    return { data, seriesKeys }
  }, [
    adjustForInflation,
    explanationsByMonth,
    monthlyByYear,
    run?.result.timeline,
    run?.snapshot,
  ])

  const ordinaryIncomeChart = useMemo(() => {
    if (!run?.snapshot) {
      return { data: [], bracketLines: [], maxValue: 0 }
    }
    const snapshot = run.snapshot
    const finishedAt = run.finishedAt
    const timeline = run.result.timeline
    const inflationRate = snapshot.scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
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
          const amount = flow.ordinaryIncome ?? 0
          if (!amount) {
            return
          }
          if (flow.category === 'work') {
            totals.salary += amount
          } else if (flow.category === 'social_security') {
            totals.socialSecurity += amount
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
      yearIndex: number
      salaryIncome: number
      investmentIncome: number
      socialSecurityIncome: number
      pensionIncome: number
      taxDeferredIncome: number
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
      if (policy) {
        const yearDelta = pointYear - policy.year
        const inflationMultiplier =
          inflationRate !== 0 ? Math.pow(1 + inflationRate, yearDelta) : 1
        policy.ordinaryBrackets.forEach((bracket, index) => {
          if (bracket.upTo === null) {
            return
          }
          const absoluteValue = bracket.upTo * inflationMultiplier
          bracketValues[`bracket_${index}`] = adjustForInflation(absoluteValue, point.date)
        })
      }
      return {
        age: point.age,
        yearIndex: point.yearIndex,
        salaryIncome: adjustForInflation(totals.salary, point.date),
        investmentIncome: adjustForInflation(totals.investment, point.date),
        socialSecurityIncome: adjustForInflation(totals.socialSecurity, point.date),
        pensionIncome: adjustForInflation(totals.pension, point.date),
        taxDeferredIncome: adjustForInflation(totals.taxDeferred, point.date),
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
      return Math.max(max, totals)
    }, 0)

    return { data, bracketLines, maxValue }
  }, [adjustForInflation, explanations, run?.finishedAt, run?.result.timeline, run?.snapshot])

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

  const summary = useMemo(() => {
    if (!run) {
      return {
        endingBalance: 0,
        minBalance: 0,
        maxBalance: 0,
      }
    }
    if (!showPresentDay) {
      return run.result.summary
    }
    const balances = run.result.timeline.map((point) =>
      adjustForInflation(point.balance, point.date),
    )
    return {
      endingBalance: balances.length > 0 ? balances[balances.length - 1] : 0,
      minBalance: balances.length > 0 ? Math.min(...balances) : 0,
      maxBalance: balances.length > 0 ? Math.max(...balances) : 0,
    }
  }, [adjustForInflation, run, showPresentDay])

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
    const holding = accountLookup.holdingById.get(holdingId)
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

      <div className="card stack">
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
      </div>

      <div className="card stack">
        <h2>Balance over time</h2>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={balanceOverTime.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="age" />
              <YAxis tickFormatter={(value) => formatAxisValue(Number(value))} width={70} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) {
                    return null
                  }
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
                      <div className="tooltip-total">
                        Total: {formatCurrency(total)}
                      </div>
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
              <Legend />
              <Area
                type="monotone"
                dataKey="cash"
                stackId="balance"
                name="Cash"
                stroke="#22c55e"
                fill="color-mix(in srgb, #22c55e 35%, transparent)"
              />
              <Area
                type="monotone"
                dataKey="taxable"
                stackId="balance"
                name="Taxable holdings"
                stroke="#2563eb"
                fill="color-mix(in srgb, #2563eb 35%, transparent)"
              />
              <Area
                type="monotone"
                dataKey="traditional"
                stackId="balance"
                name="Traditional holdings"
                stroke="#f59e0b"
                fill="color-mix(in srgb, #f59e0b 35%, transparent)"
              />
              <Area
                type="monotone"
                dataKey="roth"
                stackId="balance"
                name="Roth holdings"
                stroke="#8b5cf6"
                fill="color-mix(in srgb, #8b5cf6 35%, transparent)"
              />
              <Area
                type="monotone"
                dataKey="hsa"
                stackId="balance"
                name="HSA holdings"
                stroke="#ec4899"
                fill="color-mix(in srgb, #ec4899 35%, transparent)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {ordinaryIncomeChart.data.length > 0 ? (
        <div className="card stack">
          <h2>Ordinary income tax bracket</h2>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ordinaryIncomeChart.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="age" />
                <YAxis
                  tickFormatter={(value) => formatAxisValue(Number(value))}
                  width={70}
                  domain={[0, ordinaryIncomeChart.maxValue]}
                  allowDataOverflow={true}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    boxShadow: '0 12px 24px rgba(25, 32, 42, 0.12)',
                  }}
                  wrapperStyle={{ zIndex: 10, pointerEvents: 'none' }}
                />
                <Legend />
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
            {run.result.timeline.map((point) => {
              const isExpanded = expandedYears.has(point.yearIndex)
              const monthRows = monthlyByYear.get(point.yearIndex) ?? []
              return (
                <Fragment key={point.yearIndex}>
                  <tr
                    onClick={() =>
                      setExpandedYears((current) => {
                        const next = new Set(current)
                        if (next.has(point.yearIndex)) {
                          next.delete(point.yearIndex)
                        } else {
                          next.add(point.yearIndex)
                        }
                        return next
                      })
                    }
                  >
                    <td>
                      <span className="muted" aria-hidden="true">
                        {isExpanded ? '▾' : '▸'}
                      </span>{' '}
                      {point.date ? addMonths(point.date, -11) ?? '-' : '-'}
                    </td>
                    <td>{point.age}</td>
                    <td>{formatCurrencyForDate(point.balance, point.date)}</td>
                    <td>{formatCurrencyForDate(point.contribution, point.date)}</td>
                    <td>{formatCurrencyForDate(point.spending, point.date)}</td>
                  </tr>
                  {isExpanded
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
                                                    return (
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
