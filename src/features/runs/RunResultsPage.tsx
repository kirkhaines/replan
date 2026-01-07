import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  LineChart,
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

  const ordinaryIncomeChart = useMemo(() => {
    if (!run?.snapshot) {
      return { data: [], bracketLines: [], maxValue: 0 }
    }
    const inflationRate = run.snapshot.scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
    const holdingTaxType = new Map(
      run.snapshot.investmentAccountHoldings.map((holding) => [holding.id, holding.taxType]),
    )
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
    const bracketCount = run.snapshot.taxPolicies.reduce((max, policy) => {
      return Math.max(max, policy.ordinaryBrackets.filter((entry) => entry.upTo !== null).length)
    }, 0)
    for (let index = 0; index < bracketCount; index += 1) {
      const samplePolicy = selectTaxPolicy(
        run.snapshot.taxPolicies,
        run.snapshot.scenario.strategies.tax.policyYear || new Date(run.finishedAt).getFullYear(),
        run.snapshot.scenario.strategies.tax.filingStatus,
      )
      const rate = samplePolicy?.ordinaryBrackets[index]?.rate
      bracketLines.push({
        key: `bracket_${index}`,
        label: rate !== undefined ? `${Math.round(rate * 100)}% bracket` : `Bracket ${index + 1}`,
        rate: rate ?? 0,
      })
    }

    const data = run.result.timeline.map((point) => {
      const totals = totalsByYear.get(point.yearIndex) ?? {
        salary: 0,
        investment: 0,
        socialSecurity: 0,
        pension: 0,
        taxDeferred: 0,
      }
      const pointYear = point.date ? new Date(point.date).getFullYear() : new Date(run.finishedAt).getFullYear()
      const policy = selectTaxPolicy(
        run.snapshot.taxPolicies,
        pointYear,
        run.snapshot.scenario.strategies.tax.filingStatus,
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
          bracketValues[`bracket_${index}`] = bracket.upTo * inflationMultiplier
        })
      }
      return {
        age: point.age,
        yearIndex: point.yearIndex,
        salaryIncome: totals.salary,
        investmentIncome: totals.investment,
        socialSecurityIncome: totals.socialSecurity,
        pensionIncome: totals.pension,
        taxDeferredIncome: totals.taxDeferred,
        ...bracketValues,
      }
    })
    const maxValue = data.reduce((max, entry) => {
      const totals =
        entry.salaryIncome +
        entry.investmentIncome +
        entry.socialSecurityIncome +
        entry.pensionIncome +
        entry.taxDeferredIncome
      const bracketMax = Object.keys(entry)
        .filter((key) => key.startsWith('bracket_'))
        .reduce((innerMax, key) => Math.max(innerMax, Number(entry[key]) || 0), 0)
      return Math.max(max, totals, bracketMax)
    }, 0)

    return { data, bracketLines, maxValue }
  }, [explanations, run?.finishedAt, run?.result.timeline, run?.snapshot])

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
        <h2>Balance over time</h2>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={run.result.timeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="age" />
              <YAxis tickFormatter={(value) => formatAxisValue(Number(value))} width={70} />
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
              <Line type="monotone" dataKey="balance" stroke="var(--accent)" />
            </LineChart>
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
            <strong>{formatCurrency(run.result.summary.endingBalance)}</strong>
          </div>
          <div>
            <span className="muted">Min balance</span>
            <strong>{formatCurrency(run.result.summary.minBalance)}</strong>
          </div>
          <div>
            <span className="muted">Max balance</span>
            <strong>{formatCurrency(run.result.summary.maxBalance)}</strong>
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
                    <td>{formatCurrency(point.balance)}</td>
                    <td>{formatCurrency(point.contribution)}</td>
                    <td>{formatCurrency(point.spending)}</td>
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
                              <td className="muted">{formatCurrency(month.totalBalance)}</td>
                              <td className="muted">{formatCurrency(month.contributions)}</td>
                              <td className="muted">{formatCurrency(month.spending)}</td>
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
                                                        <td>{formatSignedCurrency(module.totals.cashflows.cash)}</td>
                                                        <td>
                                                          {formatSignedCurrency(
                                                            module.totals.cashflows.ordinaryIncome,
                                                          )}
                                                        </td>
                                                        <td>
                                                          {formatSignedCurrency(
                                                            module.totals.cashflows.capitalGains,
                                                          )}
                                                        </td>
                                                        <td>
                                                          {formatSignedCurrency(
                                                            module.totals.cashflows.deductions,
                                                          )}
                                                        </td>
                                                        <td>
                                                          {formatSignedCurrency(
                                                            module.totals.cashflows.taxExemptIncome,
                                                          )}
                                                        </td>
                                                        <td>{formatSignedCurrency(module.totals.actions.deposit)}</td>
                                                        <td>{formatSignedCurrency(module.totals.actions.withdraw)}</td>
                                                        <td>{formatSignedCurrency(module.totals.actions.convert)}</td>
                                                        <td>
                                                          {module.totals.market
                                                            ? formatSignedCurrency(module.totals.market.total)
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
                                                                              {formatSignedCurrency(flow.cash)}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrency(
                                                                                flow.ordinaryIncome ?? 0,
                                                                              )}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrency(
                                                                                flow.capitalGains ?? 0,
                                                                              )}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrency(
                                                                                flow.deductions ?? 0,
                                                                              )}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrency(
                                                                                flow.taxExemptIncome ?? 0,
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
                                                                              {formatSignedCurrency(action.amount)}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrency(
                                                                                action.resolvedAmount,
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
                                                                              {formatSignedCurrency(entry.balanceStart)}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrency(entry.balanceEnd)}
                                                                            </td>
                                                                            <td>
                                                                              {formatSignedCurrency(entry.amount)}
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
                                                  <th>Current</th>
                                                  <th>Prior</th>
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
                                                  const delta =
                                                    priorBalance !== undefined
                                                      ? account.balance - priorBalance
                                                      : null
                                                  return (
                                                    <tr key={`${account.kind}-${account.id}`}>
                                                      <td>{getAccountLabel(account)}</td>
                                                      <td>{formatSignedCurrency(account.balance)}</td>
                                                      <td>
                                                        {priorBalance !== undefined
                                                          ? formatSignedCurrency(priorBalance)
                                                          : '-'}
                                                      </td>
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
