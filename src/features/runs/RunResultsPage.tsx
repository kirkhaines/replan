import { useEffect, useState } from 'react'
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
  ReferenceLine,
} from 'recharts'
import type { SimulationRun } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import PageHeader from '../../components/PageHeader'
import { selectTaxPolicy } from '../../core/sim/tax'

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 0 })

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

const RunResultsPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const storage = useAppStore((state) => state.storage)
  const [run, setRun] = useState<SimulationRun | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  const monthlyTimeline = run.result.monthlyTimeline ?? []
  const yearOrdinaryIncome = monthlyTimeline.reduce<Map<number, number>>((acc, entry) => {
    const yearIndex = Math.floor(entry.monthIndex / 12)
    acc.set(yearIndex, (acc.get(yearIndex) ?? 0) + entry.ordinaryIncome)
    return acc
  }, new Map())

  const ordinaryIncomeSeries = run.result.timeline.map((point) => ({
    age: point.age,
    yearIndex: point.yearIndex,
    ordinaryIncome: yearOrdinaryIncome.get(point.yearIndex) ?? 0,
  }))

  const taxPolicy =
    run.snapshot && run.snapshot.taxPolicies.length > 0
      ? selectTaxPolicy(
          run.snapshot.taxPolicies,
          run.snapshot.scenario.strategies.tax.policyYear || new Date(run.finishedAt).getFullYear(),
          run.snapshot.scenario.strategies.tax.filingStatus,
        )
      : null
  const ordinaryBracketLines = taxPolicy?.ordinaryBrackets ?? []

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
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Line type="monotone" dataKey="balance" stroke="var(--accent)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {ordinaryIncomeSeries.length > 0 && taxPolicy ? (
        <div className="card stack">
          <h2>Ordinary income tax bracket</h2>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ordinaryIncomeSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="age" />
                <YAxis tickFormatter={(value) => formatAxisValue(Number(value))} width={70} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Area
                  type="monotone"
                  dataKey="ordinaryIncome"
                  stroke="var(--accent)"
                  fill="color-mix(in srgb, var(--accent) 35%, transparent)"
                />
                {ordinaryBracketLines.map((bracket) =>
                  bracket.upTo === null ? null : (
                    <ReferenceLine
                      key={`ordinary-${bracket.upTo}`}
                      y={bracket.upTo}
                      stroke="var(--muted)"
                      strokeDasharray="3 3"
                      label={{
                        position: 'right',
                        value: `${Math.round(bracket.rate * 100)}%`,
                        fill: 'var(--muted)',
                      }}
                    />
                  ),
                )}
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
        <table className="table">
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
            {run.result.timeline.map((point) => (
              <tr key={point.yearIndex}>
                <td>{point.date ? addMonths(point.date, -11) ?? '-' : '-'}</td>
                <td>{point.age}</td>
                <td>{formatCurrency(point.balance)}</td>
                <td>{formatCurrency(point.contribution)}</td>
                <td>{formatCurrency(point.spending)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default RunResultsPage
