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

const SimulationRunsSection = ({
  runs,
  locationPathname,
  formatRunTitle,
  formatRunEndingBalance,
  onRunImport,
  onRunExport,
  onRunRemove,
}: SimulationRunsSectionProps) => (
  <div className="card stack" id="section-runs">
    <div className="row">
      <h2>Simulation runs</h2>
      <span className="muted">{runs.length} total</span>
    </div>
    {runs.length === 0 ? (
      <p className="muted">No runs yet. Save and run to generate results.</p>
    ) : (
      <table className="table">
        <thead>
          <tr>
            <th>Run</th>
            <th>Finished</th>
            <th>Status</th>
            <th>Ending balance (today)</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>
                <Link className="link" to={`/runs/${run.id}`} state={{ from: locationPathname }}>
                  {formatRunTitle(run)}
                </Link>
              </td>
              <td>{new Date(run.finishedAt).toLocaleString()}</td>
              <td>{run.status}</td>
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
                  <button className="link-button" type="button" onClick={() => onRunRemove(run.id)}>
                    Remove
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
)

export default SimulationRunsSection
