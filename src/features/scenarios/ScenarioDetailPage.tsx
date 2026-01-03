import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
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

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

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
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [cashAccounts, setCashAccounts] = useState<NonInvestmentAccount[]>([])
  const [investmentAccounts, setInvestmentAccounts] = useState<InvestmentAccount[]>([])
  const [holdings, setHoldings] = useState<InvestmentAccountHolding[]>([])

  const defaultValues = useMemo(() => {
    const bundle = createDefaultScenarioBundle()
    return toEditorValues(bundle)
  }, [])

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ScenarioEditorValues>({
    resolver: zodResolver(editorSchema),
    defaultValues,
  })

  const selectedPersonId = watch('person.id')
  const selectedCashAccountId = watch('nonInvestmentAccount.id')
  const selectedInvestmentAccountId = watch('investmentAccount.id')
  const selectedHoldingId = watch('investmentAccountHolding.id')
  const selectedPersonDob = watch('person.dateOfBirth')
  const selectedPersonLifeExpectancy = watch('person.lifeExpectancy')
  const selectedCashBalance = watch('nonInvestmentAccount.balance')
  const selectedCashRate = watch('nonInvestmentAccount.interestRate')
  const selectedHoldingBalance = watch('investmentAccountHolding.balance')
  const selectedHoldingReturn = watch('investmentAccountHolding.return')
  const selectedHoldingRisk = watch('investmentAccountHolding.risk')

  const loadReferenceData = useCallback(async () => {
    const [peopleData, cashData, investmentData] = await Promise.all([
      storage.personRepo.list(),
      storage.nonInvestmentAccountRepo.list(),
      storage.investmentAccountRepo.list(),
    ])
    setPeople(peopleData)
    setCashAccounts(cashData)
    setInvestmentAccounts(investmentData)
  }, [storage])

  const loadHoldingsForAccount = useCallback(
    async (accountId: string) => {
      const list = await storage.investmentAccountHoldingRepo.listForAccount(accountId)
      setHoldings(list)
      return list
    },
    [storage],
  )

  const applyHoldingSelection = useCallback(
    (holding: InvestmentAccountHolding) => {
      setValue('investmentAccountHolding', holding, { shouldDirty: true })
      setValue('futureWorkPeriod.401kInvestmentAccountHoldingId', holding.id, {
        shouldDirty: true,
      })
      setValue('spendingLineItem.targetInvestmentAccountHoldingId', holding.id, {
        shouldDirty: true,
      })
    },
    [setValue],
  )

  const applyInvestmentAccountSelection = useCallback(
    async (account: InvestmentAccount) => {
      setValue('investmentAccount', account, { shouldDirty: true })
      setValue('scenario.investmentAccountIds', [account.id], { shouldDirty: true })
      const list = await loadHoldingsForAccount(account.id)
      if (list.length > 0) {
        applyHoldingSelection(list[0])
        setSelectionError(null)
      } else {
        setSelectionError('Selected investment account has no holdings.')
      }
    },
    [applyHoldingSelection, loadHoldingsForAccount, setSelectionError, setValue],
  )

  const applyCashAccountSelection = useCallback(
    (account: NonInvestmentAccount) => {
      setValue('nonInvestmentAccount', account, { shouldDirty: true })
      setValue('scenario.nonInvestmentAccountIds', [account.id], { shouldDirty: true })
    },
    [setValue],
  )

  const applyPersonSelection = useCallback(
    async (person: Person) => {
      const strategies = await storage.personStrategyRepo.listForPerson(person.id)
      const personStrategy = strategies[0]
      if (!personStrategy) {
        setSelectionError('Selected person has no strategy. Create one in Scenarios.')
        return
      }
      const [socialSecurityStrategy, futureWorkStrategy, futureWorkPeriods] =
        await Promise.all([
          storage.socialSecurityStrategyRepo.get(personStrategy.socialSecurityStrategyId),
          storage.futureWorkStrategyRepo.get(personStrategy.futureWorkStrategyId),
          storage.futureWorkPeriodRepo.listForStrategy(personStrategy.futureWorkStrategyId),
        ])

      if (!socialSecurityStrategy || !futureWorkStrategy || futureWorkPeriods.length === 0) {
        setSelectionError('Selected person is missing linked strategies.')
        return
      }

      setValue('person', person, { shouldDirty: true })
      setValue('personStrategy', personStrategy, { shouldDirty: true })
      setValue('scenario.personStrategyIds', [personStrategy.id], { shouldDirty: true })
      setValue('socialSecurityStrategy', socialSecurityStrategy, { shouldDirty: true })
      setValue('futureWorkStrategy', futureWorkStrategy, { shouldDirty: true })
      setValue('futureWorkPeriod', futureWorkPeriods[0], { shouldDirty: true })
      setSelectionError(null)
    },
    [setSelectionError, setValue, storage],
  )

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
    setHoldings(investmentAccountHoldings)
    setSelectionError(null)
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
    void loadReferenceData()
  }, [loadReferenceData])

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

  const handlePersonChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const personId = event.target.value
    const person = people.find((item) => item.id === personId)
    if (!person) {
      return
    }
    setSelectionError(null)
    await applyPersonSelection(person)
  }

  const handleCashAccountChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const accountId = event.target.value
    const account = cashAccounts.find((item) => item.id === accountId)
    if (!account) {
      return
    }
    applyCashAccountSelection(account)
  }

  const handleInvestmentAccountChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const accountId = event.target.value
    const account = investmentAccounts.find((item) => item.id === accountId)
    if (!account) {
      return
    }
    await applyInvestmentAccountSelection(account)
  }

  const handleHoldingChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const holdingId = event.target.value
    const holding = holdings.find((item) => item.id === holdingId)
    if (!holding) {
      return
    }
    applyHoldingSelection(holding)
  }

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

      {selectionError ? (
        <div className="card">
          <p className="error">{selectionError}</p>
        </div>
      ) : null}

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
        <input type="hidden" {...register('person.name')} />
        <input type="hidden" {...register('person.dateOfBirth')} />
        <input type="hidden" {...register('person.lifeExpectancy', { valueAsNumber: true })} />
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
        <input type="hidden" {...register('nonInvestmentAccount.name')} />
        <input
          type="hidden"
          {...register('nonInvestmentAccount.balance', { valueAsNumber: true })}
        />
        <input
          type="hidden"
          {...register('nonInvestmentAccount.interestRate', { valueAsNumber: true })}
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
        <input type="hidden" {...register('investmentAccount.name')} />
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
        <input type="hidden" {...register('investmentAccountHolding.name')} />
        <input type="hidden" {...register('investmentAccountHolding.taxType')} />
        <input
          type="hidden"
          {...register('investmentAccountHolding.balance', { valueAsNumber: true })}
        />
        <input type="hidden" {...register('investmentAccountHolding.holdingType')} />
        <input
          type="hidden"
          {...register('investmentAccountHolding.return', { valueAsNumber: true })}
        />
        <input
          type="hidden"
          {...register('investmentAccountHolding.risk', { valueAsNumber: true })}
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
            <span>Person</span>
            <select value={selectedPersonId ?? ''} onChange={handlePersonChange}>
              {people.length === 0 ? <option value="">No people available</option> : null}
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Date of birth</span>
            <input value={selectedPersonDob ?? ''} readOnly />
          </label>

          <label className="field">
            <span>Life expectancy (years)</span>
            <input value={selectedPersonLifeExpectancy ?? ''} readOnly />
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
            <span>Cash account</span>
            <select value={selectedCashAccountId ?? ''} onChange={handleCashAccountChange}>
              {cashAccounts.length === 0 ? <option value="">No accounts available</option> : null}
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Cash balance</span>
            <input value={formatCurrency(Number(selectedCashBalance ?? 0))} readOnly />
          </label>

          <label className="field">
            <span>Cash interest rate</span>
            <input value={selectedCashRate ?? ''} readOnly />
          </label>

          <label className="field">
            <span>Investment account</span>
            <select value={selectedInvestmentAccountId ?? ''} onChange={handleInvestmentAccountChange}>
              {investmentAccounts.length === 0 ? (
                <option value="">No accounts available</option>
              ) : null}
              {investmentAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Holding</span>
            <select value={selectedHoldingId ?? ''} onChange={handleHoldingChange}>
              {holdings.length === 0 ? <option value="">No holdings available</option> : null}
              {holdings.map((holding) => (
                <option key={holding.id} value={holding.id}>
                  {holding.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Holding balance</span>
            <input value={formatCurrency(Number(selectedHoldingBalance ?? 0))} readOnly />
          </label>

          <label className="field">
            <span>Expected return</span>
            <input value={selectedHoldingReturn ?? ''} readOnly />
          </label>

          <label className="field">
            <span>Risk (decimal)</span>
            <input value={selectedHoldingRisk ?? ''} readOnly />
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
