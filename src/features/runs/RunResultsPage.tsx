import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import type { SimulationRun } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import PageHeader from '../../components/PageHeader'

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 0 })

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
              <YAxis tickFormatter={(value) => formatCurrency(Number(value))} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Line type="monotone" dataKey="balance" stroke="var(--accent)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

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
