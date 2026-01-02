import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { scenarioSchema, type Scenario, type SimulationRun } from '../../core/models'
import { useAppStore } from '../../state/appStore'
import type { StorageClient } from '../../core/storage/types'
import { createDefaultScenario } from './scenarioDefaults'
import PageHeader from '../../components/PageHeader'

const persistScenario = async (
  values: Scenario,
  storage: StorageClient,
  setScenario: (scenario: Scenario) => void,
  reset: (values: Scenario) => void,
) => {
  const now = Date.now()
  const next = { ...values, updatedAt: now }
  await storage.scenarioRepo.upsert(next)
  setScenario(next)
  reset(next)
  return next
}

const ScenarioDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const storage = useAppStore((state) => state.storage)
  const simClient = useAppStore((state) => state.simClient)
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [runs, setRuns] = useState<SimulationRun[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const defaultValues = useMemo(() => createDefaultScenario(), [])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Scenario>({
    resolver: zodResolver(scenarioSchema),
    defaultValues,
  })

  const loadScenario = useCallback(async () => {
    if (!id) {
      setScenario(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const data = await storage.scenarioRepo.get(id)
    if (!data) {
      setScenario(null)
      setIsLoading(false)
      return
    }

    setScenario(data)
    reset(data)
    setIsLoading(false)
  }, [id, reset, storage])

  const loadRuns = useCallback(
    async (scenarioId: string) => {
      const data = await storage.runRepo.listForScenario(scenarioId)
      setRuns(data)
    },
    [storage],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadScenario()
  }, [loadScenario])

  useEffect(() => {
    if (scenario?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadRuns(scenario.id)
    }
  }, [loadRuns, scenario?.id])

  const onSubmit = async (values: Scenario) => {
    await persistScenario(values, storage, setScenario, reset)
  }

  const onRun = async (values: Scenario) => {
    const saved = await persistScenario(values, storage, setScenario, reset)
    const run = await simClient.runScenario(saved)
    await storage.runRepo.add(run)
    await loadRuns(saved.id)
    navigate(`/runs/${run.id}`)
  }

  if (isLoading) {
    return <p className="muted">Loading scenario...</p>
  }

  if (!scenario) {
    return (
      <section className="stack">
        <h1>Scenario not found</h1>
        <Link className="link" to="/scenarios">
          Back to scenarios
        </Link>
      </section>
    )
  }

  return (
    <section className="stack">
      <PageHeader
        title="Edit scenario"
        subtitle="Keep your assumptions in sync before running simulations."
        actions={
          <Link className="link" to="/scenarios">
            Back
          </Link>
        }
      />

      <form className="card stack" onSubmit={handleSubmit(onSubmit)}>
        <input type="hidden" {...register('id')} />
        <input type="hidden" {...register('createdAt', { valueAsNumber: true })} />
        <input type="hidden" {...register('updatedAt', { valueAsNumber: true })} />
        <div className="form-grid">
          <label className="field">
            <span>Name</span>
            <input {...register('name')} />
            {errors.name ? <span className="error">{errors.name.message}</span> : null}
          </label>

          <label className="field">
            <span>Current age</span>
            <input type="number" {...register('person.currentAge', { valueAsNumber: true })} />
            {errors.person?.currentAge ? (
              <span className="error">{errors.person.currentAge.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Retirement age</span>
            <input type="number" {...register('person.retirementAge', { valueAsNumber: true })} />
            {errors.person?.retirementAge ? (
              <span className="error">{errors.person.retirementAge.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Starting balance</span>
            <input
              type="number"
              step="1000"
              {...register('finances.startingBalance', { valueAsNumber: true })}
            />
            {errors.finances?.startingBalance ? (
              <span className="error">{errors.finances.startingBalance.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Annual contribution</span>
            <input
              type="number"
              step="100"
              {...register('finances.annualContribution', { valueAsNumber: true })}
            />
            {errors.finances?.annualContribution ? (
              <span className="error">{errors.finances.annualContribution.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Annual spending</span>
            <input
              type="number"
              step="100"
              {...register('finances.annualSpending', { valueAsNumber: true })}
            />
            {errors.finances?.annualSpending ? (
              <span className="error">{errors.finances.annualSpending.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Annual return</span>
            <input
              type="number"
              step="0.001"
              {...register('assumptions.annualReturn', { valueAsNumber: true })}
            />
            {errors.assumptions?.annualReturn ? (
              <span className="error">{errors.assumptions.annualReturn.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Annual inflation</span>
            <input
              type="number"
              step="0.001"
              {...register('assumptions.annualInflation', { valueAsNumber: true })}
            />
            {errors.assumptions?.annualInflation ? (
              <span className="error">{errors.assumptions.annualInflation.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Years to simulate</span>
            <input type="number" {...register('assumptions.years', { valueAsNumber: true })} />
            {errors.assumptions?.years ? (
              <span className="error">{errors.assumptions.years.message}</span>
            ) : null}
          </label>
        </div>

        <div className="button-row">
          <button className="button" type="submit" disabled={isSubmitting || !isDirty}>
            Save scenario
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit(onRun)}
          >
            Run simulation
          </button>
        </div>
      </form>

      <div className="card stack">
        <div className="row">
          <h2>Simulation runs</h2>
          <span className="muted">{runs.length} total</span>
        </div>
        {runs.length === 0 ? (
          <p className="muted">No runs yet. Save and run to generate results.</p>
        ) : (
          <div className="runs">
            {runs.map((run) => (
              <Link className="run-item" key={run.id} to={`/runs/${run.id}`}>
                <div>
                  <strong>{new Date(run.finishedAt).toLocaleString()}</strong>
                  <span className="muted">{run.status}</span>
                </div>
                <span className="muted">
                  Ending balance {run.result.summary.endingBalance.toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default ScenarioDetailPage
