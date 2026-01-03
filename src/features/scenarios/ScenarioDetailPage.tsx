import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  scenarioSchema,
  personSchema,
  socialSecurityStrategySchema,
  futureWorkStrategySchema,
  futureWorkPeriodSchema,
  spendingStrategySchema,
  spendingLineItemSchema,
  nonInvestmentAccountSchema,
  investmentAccountSchema,
  investmentAccountHoldingSchema,
  personStrategySchema,
  fundingStrategyTypeSchema,
  holdingTypeSchema,
  taxTypeSchema,
  type Scenario,
  type SimulationRun,
  type Person,
  type SocialSecurityStrategy,
  type FutureWorkStrategy,
  type FutureWorkPeriod,
  type SpendingStrategy,
  type SpendingLineItem,
  type NonInvestmentAccount,
  type InvestmentAccount,
  type InvestmentAccountHolding,
  type PersonStrategy,
} from '../../core/models'
import type { SimulationInput } from '../../core/sim/input'
import { useAppStore } from '../../state/appStore'
import type { StorageClient } from '../../core/storage/types'
import { createDefaultScenarioBundle } from './scenarioDefaults'
import PageHeader from '../../components/PageHeader'

type ScenarioEditorValues = {
  scenario: Scenario
  person: Person
  socialSecurityStrategy: SocialSecurityStrategy
  futureWorkStrategy: FutureWorkStrategy
  futureWorkPeriod: FutureWorkPeriod
  spendingStrategy: SpendingStrategy
  spendingLineItem: SpendingLineItem
  nonInvestmentAccount: NonInvestmentAccount
  investmentAccount: InvestmentAccount
  investmentAccountHolding: InvestmentAccountHolding
  personStrategy: PersonStrategy
}

const editorSchema = z.object({
  scenario: scenarioSchema,
  person: personSchema,
  socialSecurityStrategy: socialSecurityStrategySchema,
  futureWorkStrategy: futureWorkStrategySchema,
  futureWorkPeriod: futureWorkPeriodSchema,
  spendingStrategy: spendingStrategySchema,
  spendingLineItem: spendingLineItemSchema,
  nonInvestmentAccount: nonInvestmentAccountSchema,
  investmentAccount: investmentAccountSchema,
  investmentAccountHolding: investmentAccountHoldingSchema,
  personStrategy: personStrategySchema,
})

const toEditorValues = (bundle: ScenarioEditorValues): ScenarioEditorValues => bundle

const ageFromDob = (dateOfBirth: string) => {
  const dob = new Date(dateOfBirth)
  const now = new Date()
  const diff = now.getTime() - dob.getTime()
  const years = diff / (365.25 * 24 * 60 * 60 * 1000)
  return Math.max(0, Math.floor(years))
}

const buildSimulationInput = (values: ScenarioEditorValues): SimulationInput => {
  const currentAge = ageFromDob(values.person.dateOfBirth)
  const years = Math.max(1, Math.round(values.person.lifeExpectancy - currentAge))
  const startingBalance =
    values.nonInvestmentAccount.balance + values.investmentAccountHolding.balance
  const annualReturn =
    values.investmentAccountHolding.balance > 0 ? values.investmentAccountHolding.return : 0
  const annualSpending =
    (values.spendingLineItem.needAmount + values.spendingLineItem.wantAmount) * 12
  const annualContribution =
    (values.futureWorkPeriod.salary + values.futureWorkPeriod.bonus) *
    values.futureWorkPeriod['401kMatchPctCap'] *
    values.futureWorkPeriod['401kMatchRatio']

  return {
    scenarioId: values.scenario.id,
    currentAge,
    years,
    startingBalance,
    annualContribution,
    annualSpending,
    annualReturn,
    annualInflation: 0.02,
  }
}

const normalizeValues = (values: ScenarioEditorValues, now: number): ScenarioEditorValues => {
  const scenario = {
    ...values.scenario,
    updatedAt: now,
    personStrategyIds: [values.personStrategy.id],
    nonInvestmentAccountIds: [values.nonInvestmentAccount.id],
    investmentAccountIds: [values.investmentAccount.id],
    spendingStrategyId: values.spendingStrategy.id,
  }

  return {
    scenario,
    person: { ...values.person, updatedAt: now },
    socialSecurityStrategy: {
      ...values.socialSecurityStrategy,
      updatedAt: now,
      personId: values.person.id,
    },
    futureWorkStrategy: {
      ...values.futureWorkStrategy,
      updatedAt: now,
      personId: values.person.id,
    },
    futureWorkPeriod: {
      ...values.futureWorkPeriod,
      updatedAt: now,
      futureWorkStrategyId: values.futureWorkStrategy.id,
      '401kInvestmentAccountHoldingId': values.investmentAccountHolding.id,
    },
    spendingStrategy: { ...values.spendingStrategy, updatedAt: now },
    spendingLineItem: {
      ...values.spendingLineItem,
      updatedAt: now,
      spendingStrategyId: values.spendingStrategy.id,
      targetInvestmentAccountHoldingId: values.investmentAccountHolding.id,
    },
    nonInvestmentAccount: { ...values.nonInvestmentAccount, updatedAt: now },
    investmentAccount: { ...values.investmentAccount, updatedAt: now },
    investmentAccountHolding: {
      ...values.investmentAccountHolding,
      updatedAt: now,
      investmentAccountId: values.investmentAccount.id,
    },
    personStrategy: {
      ...values.personStrategy,
      updatedAt: now,
      personId: values.person.id,
      futureWorkStrategyId: values.futureWorkStrategy.id,
      socialSecurityStrategyId: values.socialSecurityStrategy.id,
    },
  }
}

const persistBundle = async (
  values: ScenarioEditorValues,
  storage: StorageClient,
  setScenario: (scenario: Scenario) => void,
  reset: (values: ScenarioEditorValues) => void,
) => {
  const now = Date.now()
  const normalized = normalizeValues(values, now)

  await storage.personRepo.upsert(normalized.person)
  await storage.socialSecurityStrategyRepo.upsert(normalized.socialSecurityStrategy)
  await storage.futureWorkStrategyRepo.upsert(normalized.futureWorkStrategy)
  await storage.futureWorkPeriodRepo.upsert(normalized.futureWorkPeriod)
  await storage.spendingStrategyRepo.upsert(normalized.spendingStrategy)
  await storage.spendingLineItemRepo.upsert(normalized.spendingLineItem)
  await storage.nonInvestmentAccountRepo.upsert(normalized.nonInvestmentAccount)
  await storage.investmentAccountRepo.upsert(normalized.investmentAccount)
  await storage.investmentAccountHoldingRepo.upsert(normalized.investmentAccountHolding)
  await storage.personStrategyRepo.upsert(normalized.personStrategy)
  await storage.scenarioRepo.upsert(normalized.scenario)

  setScenario(normalized.scenario)
  reset(normalized)
  return normalized
}

const ScenarioDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const storage = useAppStore((state) => state.storage)
  const simClient = useAppStore((state) => state.simClient)
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [runs, setRuns] = useState<SimulationRun[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const defaultValues = useMemo(() => {
    const bundle = createDefaultScenarioBundle()
    return toEditorValues(bundle)
  }, [])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ScenarioEditorValues>({
    resolver: zodResolver(editorSchema),
    defaultValues,
  })

  const loadScenario = useCallback(async () => {
    if (!id) {
      setScenario(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setLoadError(null)
    const data = await storage.scenarioRepo.get(id)
    if (!data) {
      setScenario(null)
      setIsLoading(false)
      return
    }

    const personStrategy = await storage.personStrategyRepo.get(data.personStrategyIds[0])
    const nonInvestmentAccount = await storage.nonInvestmentAccountRepo.get(
      data.nonInvestmentAccountIds[0],
    )
    const investmentAccount = await storage.investmentAccountRepo.get(
      data.investmentAccountIds[0],
    )
    const spendingStrategy = await storage.spendingStrategyRepo.get(data.spendingStrategyId)

    if (!personStrategy || !nonInvestmentAccount || !investmentAccount || !spendingStrategy) {
      setLoadError('Scenario is missing linked data. Create a new scenario to continue.')
      setScenario(null)
      setIsLoading(false)
      return
    }

    const person = await storage.personRepo.get(personStrategy.personId)
    const socialSecurityStrategy = await storage.socialSecurityStrategyRepo.get(
      personStrategy.socialSecurityStrategyId,
    )
    const futureWorkStrategy = await storage.futureWorkStrategyRepo.get(
      personStrategy.futureWorkStrategyId,
    )
    const futureWorkPeriods = await storage.futureWorkPeriodRepo.listForStrategy(
      personStrategy.futureWorkStrategyId,
    )
    const spendingLineItems = await storage.spendingLineItemRepo.listForStrategy(
      spendingStrategy.id,
    )
    const investmentAccountHoldings = await storage.investmentAccountHoldingRepo.listForAccount(
      investmentAccount.id,
    )

    if (
      !person ||
      !socialSecurityStrategy ||
      !futureWorkStrategy ||
      futureWorkPeriods.length === 0 ||
      spendingLineItems.length === 0 ||
      investmentAccountHoldings.length === 0
    ) {
      setLoadError('Scenario is missing linked data. Create a new scenario to continue.')
      setScenario(null)
      setIsLoading(false)
      return
    }

    const bundle: ScenarioEditorValues = {
      scenario: data,
      person,
      socialSecurityStrategy,
      futureWorkStrategy,
      futureWorkPeriod: futureWorkPeriods[0],
      spendingStrategy,
      spendingLineItem: spendingLineItems[0],
      nonInvestmentAccount,
      investmentAccount,
      investmentAccountHolding: investmentAccountHoldings[0],
      personStrategy,
    }

    setScenario(data)
    reset(bundle)
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

  const onSubmit = async (values: ScenarioEditorValues) => {
    await persistBundle(values, storage, setScenario, reset)
  }

  const onRun = async (values: ScenarioEditorValues) => {
    const saved = await persistBundle(values, storage, setScenario, reset)
    const input = buildSimulationInput(saved)
    const run = await simClient.runScenario(input)
    await storage.runRepo.add(run)
    await loadRuns(saved.scenario.id)
    navigate(`/runs/${run.id}`)
  }

  if (isLoading) {
    return <p className="muted">Loading scenario...</p>
  }

  if (loadError) {
    return (
      <section className="stack">
        <h1>Scenario data missing</h1>
        <p className="muted">{loadError}</p>
        <Link className="link" to="/scenarios">
          Back to scenarios
        </Link>
      </section>
    )
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
        subtitle="Update people, accounts, and spending before running simulations."
        actions={
          <Link className="link" to="/scenarios">
            Back
          </Link>
        }
      />

      <form className="card stack" onSubmit={handleSubmit(onSubmit)}>
        <input type="hidden" {...register('scenario.id')} />
        <input type="hidden" {...register('scenario.createdAt', { valueAsNumber: true })} />
        <input type="hidden" {...register('scenario.updatedAt', { valueAsNumber: true })} />
        <input type="hidden" {...register('scenario.personStrategyIds.0')} />
        <input type="hidden" {...register('scenario.nonInvestmentAccountIds.0')} />
        <input type="hidden" {...register('scenario.investmentAccountIds.0')} />
        <input type="hidden" {...register('scenario.spendingStrategyId')} />
        <input type="hidden" {...register('person.id')} />
        <input type="hidden" {...register('person.createdAt', { valueAsNumber: true })} />
        <input type="hidden" {...register('person.updatedAt', { valueAsNumber: true })} />
        <input type="hidden" {...register('socialSecurityStrategy.id')} />
        <input type="hidden" {...register('socialSecurityStrategy.personId')} />
        <input
          type="hidden"
          {...register('socialSecurityStrategy.createdAt', { valueAsNumber: true })}
        />
        <input
          type="hidden"
          {...register('socialSecurityStrategy.updatedAt', { valueAsNumber: true })}
        />
        <input type="hidden" {...register('futureWorkStrategy.id')} />
        <input type="hidden" {...register('futureWorkStrategy.personId')} />
        <input
          type="hidden"
          {...register('futureWorkStrategy.createdAt', { valueAsNumber: true })}
        />
        <input
          type="hidden"
          {...register('futureWorkStrategy.updatedAt', { valueAsNumber: true })}
        />
        <input type="hidden" {...register('futureWorkPeriod.id')} />
        <input type="hidden" {...register('futureWorkPeriod.futureWorkStrategyId')} />
        <input type="hidden" {...register('futureWorkPeriod.401kInvestmentAccountHoldingId')} />
        <input
          type="hidden"
          {...register('futureWorkPeriod.createdAt', { valueAsNumber: true })}
        />
        <input
          type="hidden"
          {...register('futureWorkPeriod.updatedAt', { valueAsNumber: true })}
        />
        <input type="hidden" {...register('spendingStrategy.id')} />
        <input
          type="hidden"
          {...register('spendingStrategy.createdAt', { valueAsNumber: true })}
        />
        <input
          type="hidden"
          {...register('spendingStrategy.updatedAt', { valueAsNumber: true })}
        />
        <input type="hidden" {...register('spendingLineItem.id')} />
        <input type="hidden" {...register('spendingLineItem.spendingStrategyId')} />
        <input type="hidden" {...register('spendingLineItem.targetInvestmentAccountHoldingId')} />
        <input
          type="hidden"
          {...register('spendingLineItem.createdAt', { valueAsNumber: true })}
        />
        <input
          type="hidden"
          {...register('spendingLineItem.updatedAt', { valueAsNumber: true })}
        />
        <input type="hidden" {...register('nonInvestmentAccount.id')} />
        <input
          type="hidden"
          {...register('nonInvestmentAccount.createdAt', { valueAsNumber: true })}
        />
        <input
          type="hidden"
          {...register('nonInvestmentAccount.updatedAt', { valueAsNumber: true })}
        />
        <input type="hidden" {...register('investmentAccount.id')} />
        <input
          type="hidden"
          {...register('investmentAccount.createdAt', { valueAsNumber: true })}
        />
        <input
          type="hidden"
          {...register('investmentAccount.updatedAt', { valueAsNumber: true })}
        />
        <input type="hidden" {...register('investmentAccountHolding.id')} />
        <input type="hidden" {...register('investmentAccountHolding.investmentAccountId')} />
        <input
          type="hidden"
          {...register('investmentAccountHolding.createdAt', { valueAsNumber: true })}
        />
        <input
          type="hidden"
          {...register('investmentAccountHolding.updatedAt', { valueAsNumber: true })}
        />
        <input type="hidden" {...register('personStrategy.id')} />
        <input type="hidden" {...register('personStrategy.personId')} />
        <input type="hidden" {...register('personStrategy.futureWorkStrategyId')} />
        <input type="hidden" {...register('personStrategy.socialSecurityStrategyId')} />
        <input
          type="hidden"
          {...register('personStrategy.createdAt', { valueAsNumber: true })}
        />
        <input
          type="hidden"
          {...register('personStrategy.updatedAt', { valueAsNumber: true })}
        />

        <div className="form-grid">
          <label className="field">
            <span>Scenario name</span>
            <input {...register('scenario.name')} />
            {errors.scenario?.name ? (
              <span className="error">{errors.scenario.name.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Funding strategy</span>
            <select {...register('scenario.fundingStrategyType')}>
              {fundingStrategyTypeSchema.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Person name</span>
            <input {...register('person.name')} />
            {errors.person?.name ? (
              <span className="error">{errors.person.name.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Date of birth</span>
            <input type="date" {...register('person.dateOfBirth')} />
            {errors.person?.dateOfBirth ? (
              <span className="error">{errors.person.dateOfBirth.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Life expectancy (years)</span>
            <input type="number" {...register('person.lifeExpectancy', { valueAsNumber: true })} />
            {errors.person?.lifeExpectancy ? (
              <span className="error">{errors.person.lifeExpectancy.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Social Security start age</span>
            <input
              type="number"
              {...register('socialSecurityStrategy.startAge', { valueAsNumber: true })}
            />
            {errors.socialSecurityStrategy?.startAge ? (
              <span className="error">{errors.socialSecurityStrategy.startAge.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Cash account name</span>
            <input {...register('nonInvestmentAccount.name')} />
          </label>

          <label className="field">
            <span>Cash balance</span>
            <input
              type="number"
              {...register('nonInvestmentAccount.balance', { valueAsNumber: true })}
            />
          </label>

          <label className="field">
            <span>Cash interest rate</span>
            <input
              type="number"
              step="0.001"
              {...register('nonInvestmentAccount.interestRate', { valueAsNumber: true })}
            />
          </label>

          <label className="field">
            <span>Investment account name</span>
            <input {...register('investmentAccount.name')} />
          </label>

          <label className="field">
            <span>Holding name</span>
            <input {...register('investmentAccountHolding.name')} />
          </label>

          <label className="field">
            <span>Holding type</span>
            <select {...register('investmentAccountHolding.holdingType')}>
              {holdingTypeSchema.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Tax type</span>
            <select {...register('investmentAccountHolding.taxType')}>
              {taxTypeSchema.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Holding balance</span>
            <input
              type="number"
              {...register('investmentAccountHolding.balance', { valueAsNumber: true })}
            />
          </label>

          <label className="field">
            <span>Expected return</span>
            <input
              type="number"
              step="0.001"
              {...register('investmentAccountHolding.return', { valueAsNumber: true })}
            />
          </label>

          <label className="field">
            <span>Risk (decimal)</span>
            <input
              type="number"
              step="0.001"
              {...register('investmentAccountHolding.risk', { valueAsNumber: true })}
            />
          </label>

          <label className="field">
            <span>Work strategy name</span>
            <input {...register('futureWorkStrategy.name')} />
          </label>

          <label className="field">
            <span>Work period name</span>
            <input {...register('futureWorkPeriod.name')} />
          </label>

          <label className="field">
            <span>Salary</span>
            <input
              type="number"
              {...register('futureWorkPeriod.salary', { valueAsNumber: true })}
            />
          </label>

          <label className="field">
            <span>Bonus</span>
            <input
              type="number"
              {...register('futureWorkPeriod.bonus', { valueAsNumber: true })}
            />
          </label>

          <label className="field">
            <span>Work start date</span>
            <input type="date" {...register('futureWorkPeriod.startDate')} />
          </label>

          <label className="field">
            <span>Work end date</span>
            <input type="date" {...register('futureWorkPeriod.endDate')} />
          </label>

          <label className="field">
            <span>401k match cap</span>
            <input
              type="number"
              step="0.001"
              {...register('futureWorkPeriod.401kMatchPctCap', { valueAsNumber: true })}
            />
          </label>

          <label className="field">
            <span>401k match ratio</span>
            <input
              type="number"
              step="0.01"
              {...register('futureWorkPeriod.401kMatchRatio', { valueAsNumber: true })}
            />
          </label>

          <label className="field">
            <span>Includes health insurance</span>
            <input type="checkbox" {...register('futureWorkPeriod.includesHealthInsurance')} />
          </label>

          <label className="field">
            <span>Spending strategy name</span>
            <input {...register('spendingStrategy.name')} />
          </label>

          <label className="field">
            <span>Spending item name</span>
            <input {...register('spendingLineItem.name')} />
          </label>

          <label className="field">
            <span>Category</span>
            <input {...register('spendingLineItem.category')} />
          </label>

          <label className="field">
            <span>Need amount (monthly)</span>
            <input
              type="number"
              {...register('spendingLineItem.needAmount', { valueAsNumber: true })}
            />
          </label>

          <label className="field">
            <span>Want amount (monthly)</span>
            <input
              type="number"
              {...register('spendingLineItem.wantAmount', { valueAsNumber: true })}
            />
          </label>

          <label className="field">
            <span>Spending start</span>
            <input type="date" {...register('spendingLineItem.startDate')} />
          </label>

          <label className="field">
            <span>Spending end</span>
            <input type="date" {...register('spendingLineItem.endDate')} />
          </label>

          <label className="field">
            <span>Pre-tax</span>
            <input type="checkbox" {...register('spendingLineItem.isPreTax')} />
          </label>

          <label className="field">
            <span>Charitable</span>
            <input type="checkbox" {...register('spendingLineItem.isCharitable')} />
          </label>

          <label className="field">
            <span>Work-related</span>
            <input type="checkbox" {...register('spendingLineItem.isWork')} />
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
