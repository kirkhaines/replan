import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { SimulationRunSummary } from '../../../core/models'

type SimulationRunsSectionProps = {
  runs: SimulationRunSummary[]
  locationPathname: string
  formatRunTitle: (run: SimulationRunSummary) => string
  formatRunEndingBalance: (run: SimulationRunSummary) => number
  onRunImport: (run: SimulationRunSummary) => void
  onRunExport: (run: SimulationRunSummary) => void
  onRunRemove: (id: string) => void
}

const pageSize = 6

const formatPercent = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return '—'
  }
  return `${value.toFixed(1)}%`
}

const SimulationRunsSection = ({
  runs,
  locationPathname,
  formatRunTitle,
  formatRunEndingBalance,
  onRunImport,
  onRunExport,
  onRunRemove,
}: SimulationRunsSectionProps) => {
  const [pageIndex, setPageIndex] = useState(0)
  const totalPages = Math.max(1, Math.ceil(runs.length / pageSize))
  const safePageIndex = Math.min(pageIndex, totalPages - 1)
  const pagedRuns = useMemo(() => {
    const start = safePageIndex * pageSize
    return runs.slice(start, start + pageSize)
  }, [runs, safePageIndex])

  return (
    <div className="card stack" id="section-runs">
      <div className="row">
        <h2>Simulation runs</h2>
        <span className="muted">{runs.length} total</span>
      </div>
      {runs.length === 0 ? (
        <p className="muted">No runs yet. Save and run to generate results.</p>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Finished</th>
                <th>Status</th>
                <th>Success %</th>
                <th>Ending balance (today)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedRuns.map((run) => (
                <tr key={run.id}>
                  <td>
                    <Link className="link" to={`/runs/${run.id}`} state={{ from: locationPathname }}>
                      {formatRunTitle(run)}
                    </Link>
                  </td>
                  <td>{new Date(run.finishedAt).toLocaleString()}</td>
                  <td>{run.status}</td>
                  <td>{formatPercent(run.stochasticSuccessPct)}</td>
                  <td>{formatRunEndingBalance(run).toLocaleString()}</td>
                  <td>
                    <div className="button-row">
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => onRunImport(run)}
                      >
                        Import as scenario
                      </button>
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => onRunExport(run)}
                      >
                        Export run
                      </button>
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => onRunRemove(run.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 ? (
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">
                Page {safePageIndex + 1} of {totalPages}
              </span>
              <div className="button-row">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setPageIndex(Math.max(0, safePageIndex - 1))}
                  disabled={safePageIndex === 0}
                >
                  Previous
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    setPageIndex(Math.min(totalPages - 1, safePageIndex + 1))
                  }
                  disabled={safePageIndex >= totalPages - 1}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

export default SimulationRunsSection
