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
import { useAppStore } from '../../state/appStore'
import type { SimulationInput } from '../../core/sim/input'
import type { StorageClient } from '../../core/storage/types'
import { createDefaultScenarioBundle } from './scenarioDefaults'
import { createUuid } from '../../core/utils/uuid'
import PageHeader from '../../components/PageHeader'

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

const ageFromDob = (dateOfBirth: string) => {
  const dob = new Date(dateOfBirth)
  const now = new Date()
  const diff = now.getTime() - dob.getTime()
  const years = diff / (365.25 * 24 * 60 * 60 * 1000)
  return Math.max(0, Math.floor(years))
}

const createCashAccount = (): NonInvestmentAccount => {
  const now = Date.now()
  return {
    id: createUuid(),
    name: 'Cash',
    balance: 10000,
    interestRate: 0.01,
    createdAt: now,
    updatedAt: now,
  }
}

const createInvestmentAccount = (): InvestmentAccount => {
  const now = Date.now()
  return {
    id: createUuid(),
    name: 'Brokerage',
    createdAt: now,
    updatedAt: now,
  }
}

const createHolding = (investmentAccountId: string): InvestmentAccountHolding => {
  const now = Date.now()
  return {
    id: createUuid(),
    name: 'S&P 500',
    taxType: 'taxable',
    balance: 50000,
    holdingType: 'sp500',
    return: 0.05,
    risk: 0.15,
    investmentAccountId,
    createdAt: now,
    updatedAt: now,
  }
}

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
  const [personStrategies, setPersonStrategies] = useState<PersonStrategy[]>([])
  const [socialSecurityStrategies, setSocialSecurityStrategies] = useState<SocialSecurityStrategy[]>(
    [],
  )
  const [futureWorkStrategies, setFutureWorkStrategies] = useState<FutureWorkStrategy[]>([])
  const [spendingStrategies, setSpendingStrategies] = useState<SpendingStrategy[]>([])
  const [spendingLineItems, setSpendingLineItems] = useState<SpendingLineItem[]>([])
  const [cashAccounts, setCashAccounts] = useState<NonInvestmentAccount[]>([])
  const [investmentAccounts, setInvestmentAccounts] = useState<InvestmentAccount[]>([])
  const [investmentBalances, setInvestmentBalances] = useState<Record<string, number>>({})

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

  const selectedSpendingStrategyId = watch('spendingStrategy.id')
  const personStrategyIds = watch('scenario.personStrategyIds')
  const nonInvestmentAccountIds = watch('scenario.nonInvestmentAccountIds')
  const investmentAccountIds = watch('scenario.investmentAccountIds')

  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  )
  const socialSecurityById = useMemo(
    () => new Map(socialSecurityStrategies.map((strategy) => [strategy.id, strategy])),
    [socialSecurityStrategies],
  )
  const futureWorkById = useMemo(
    () => new Map(futureWorkStrategies.map((strategy) => [strategy.id, strategy])),
    [futureWorkStrategies],
  )

  const scenarioPersonStrategies = useMemo(() => {
    const ids = new Set(scenario?.personStrategyIds ?? [])
    return personStrategies.filter((strategy) => ids.has(strategy.id))
  }, [personStrategies, scenario?.personStrategyIds])

  const scenarioCashAccounts = useMemo(() => {
    const ids = new Set(scenario?.nonInvestmentAccountIds ?? [])
    return cashAccounts.filter((account) => ids.has(account.id))
  }, [cashAccounts, scenario?.nonInvestmentAccountIds])

  const scenarioInvestmentAccounts = useMemo(() => {
    const ids = new Set(scenario?.investmentAccountIds ?? [])
    return investmentAccounts.filter((account) => ids.has(account.id))
  }, [investmentAccounts, scenario?.investmentAccountIds])

  const loadReferenceData = useCallback(async () => {
    const [
      peopleData,
      personStrategyData,
      socialSecurityData,
      futureWorkData,
      spendingStrategyData,
      cashData,
      investmentData,
      holdingData,
    ] = await Promise.all([
      storage.personRepo.list(),
      storage.personStrategyRepo.list(),
      storage.socialSecurityStrategyRepo.list(),
      storage.futureWorkStrategyRepo.list(),
      storage.spendingStrategyRepo.list(),
      storage.nonInvestmentAccountRepo.list(),
      storage.investmentAccountRepo.list(),
      storage.investmentAccountHoldingRepo.list(),
    ])
    setPeople(peopleData)
    setPersonStrategies(personStrategyData)
    setSocialSecurityStrategies(socialSecurityData)
    setFutureWorkStrategies(futureWorkData)
    setSpendingStrategies(spendingStrategyData)
    setCashAccounts(cashData)
    setInvestmentAccounts(investmentData)
    const balanceMap = holdingData.reduce<Record<string, number>>((acc, holding) => {
      acc[holding.investmentAccountId] =
        (acc[holding.investmentAccountId] ?? 0) + holding.balance
      return acc
    }, {})
    setInvestmentBalances(balanceMap)
    return {
      peopleData,
      personStrategyData,
      spendingStrategyData,
      cashData,
      investmentData,
      holdingData,
    }
  }, [storage])

  const loadHoldingsForAccount = useCallback(
    async (accountId: string) => storage.investmentAccountHoldingRepo.listForAccount(accountId),
    [storage],
  )

  const loadSpendingLineItemsForStrategy = useCallback(
    async (strategyId: string) => storage.spendingLineItemRepo.listForStrategy(strategyId),
    [storage],
  )

  const updateScenarioIds = useCallback(
    async (
      updater: (current: Scenario) => Scenario,
      options: { persist: boolean },
    ) => {
      if (!scenario) {
        return
      }
      const next = updater(scenario)
      setScenario(next)
      setValue('scenario.personStrategyIds', next.personStrategyIds, { shouldDirty: true })
      setValue('scenario.nonInvestmentAccountIds', next.nonInvestmentAccountIds, {
        shouldDirty: true,
      })
      setValue('scenario.investmentAccountIds', next.investmentAccountIds, { shouldDirty: true })
      setValue('scenario.updatedAt', next.updatedAt, { shouldDirty: true })
      if (options.persist) {
        await storage.scenarioRepo.upsert(next)
      }
    },
    [scenario, setScenario, setValue, storage],
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
    },
    [setValue],
  )

  const applyPersonStrategySelection = useCallback(
    async (personStrategy: PersonStrategy) => {
      const person = people.find((item) => item.id === personStrategy.personId)
      const socialSecurityStrategy = socialSecurityStrategies.find(
        (item) => item.id === personStrategy.socialSecurityStrategyId,
      )
      const futureWorkStrategy = futureWorkStrategies.find(
        (item) => item.id === personStrategy.futureWorkStrategyId,
      )
      const futureWorkPeriods = await storage.futureWorkPeriodRepo.listForStrategy(
        personStrategy.futureWorkStrategyId,
      )

      if (
        !person ||
        !socialSecurityStrategy ||
        !futureWorkStrategy ||
        futureWorkPeriods.length === 0
      ) {
        setSelectionError('Selected person strategy is missing linked data.')
        return
      }

      setValue('person', person, { shouldDirty: true })
      setValue('personStrategy', personStrategy, { shouldDirty: true })
      setValue('socialSecurityStrategy', socialSecurityStrategy, { shouldDirty: true })
      setValue('futureWorkStrategy', futureWorkStrategy, { shouldDirty: true })
      setValue('futureWorkPeriod', futureWorkPeriods[0], { shouldDirty: true })
      setSelectionError(null)
    },
    [
      futureWorkStrategies,
      people,
      setSelectionError,
      setValue,
      socialSecurityStrategies,
      storage,
    ],
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
    setSpendingLineItems(spendingLineItems)
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
     
    void loadReferenceData()
  }, [loadReferenceData])

  useEffect(() => {
     
    void loadScenario()
  }, [loadScenario])

  useEffect(() => {
    if (scenario?.id) {
       
      void loadRuns(scenario.id)
    }
  }, [loadRuns, scenario?.id])

  const handleSpendingStrategySelect = async (strategyId: string) => {
    const strategy = spendingStrategies.find((item) => item.id === strategyId)
    if (!strategy) {
      return
    }
    setValue('spendingStrategy', strategy, { shouldDirty: true })
    setValue('scenario.spendingStrategyId', strategy.id, { shouldDirty: true })
    const items = await loadSpendingLineItemsForStrategy(strategy.id)
    setSpendingLineItems(items)
    if (items.length > 0) {
      setValue('spendingLineItem', items[0], { shouldDirty: true })
      setSelectionError(null)
    } else {
      setSelectionError('Selected spending strategy has no line items.')
    }
  }

  const handleAddPersonStrategy = async () => {
    const holdingList = await storage.investmentAccountHoldingRepo.list()
    if (holdingList.length === 0) {
      setSelectionError('Create an investment account holding before adding a person strategy.')
      return
    }

    const now = Date.now()
    const personId = createUuid()
    const socialSecurityStrategyId = createUuid()
    const futureWorkStrategyId = createUuid()
    const futureWorkPeriodId = createUuid()
    const personStrategyId = createUuid()
    const today = new Date()
    const tenYears = new Date()
    tenYears.setFullYear(today.getFullYear() + 10)
    const toIsoDate = (value: Date) => value.toISOString().slice(0, 10)

    await storage.personRepo.upsert({
      id: personId,
      name: 'New Person',
      dateOfBirth: '1985-01-01',
      lifeExpectancy: 90,
      createdAt: now,
      updatedAt: now,
    })
    await storage.socialSecurityStrategyRepo.upsert({
      id: socialSecurityStrategyId,
      personId,
      startAge: 67,
      createdAt: now,
      updatedAt: now,
    })
    await storage.futureWorkStrategyRepo.upsert({
      id: futureWorkStrategyId,
      name: 'Work plan',
      personId,
      createdAt: now,
      updatedAt: now,
    })
    await storage.futureWorkPeriodRepo.upsert({
      id: futureWorkPeriodId,
      name: 'Primary job',
      futureWorkStrategyId,
      salary: 90000,
      bonus: 5000,
      startDate: toIsoDate(today),
      endDate: toIsoDate(tenYears),
      '401kMatchPctCap': 0.05,
      '401kMatchRatio': 1,
      '401kInvestmentAccountHoldingId': holdingList[0].id,
      includesHealthInsurance: true,
      createdAt: now,
      updatedAt: now,
    })
    await storage.personStrategyRepo.upsert({
      id: personStrategyId,
      personId,
      futureWorkStrategyId,
      socialSecurityStrategyId,
      createdAt: now,
      updatedAt: now,
    })

    const nowForScenario = Date.now()
    await updateScenarioIds(
      (current) => ({
        ...current,
        updatedAt: current.updatedAt ?? nowForScenario,
        personStrategyIds: [...current.personStrategyIds, personStrategyId],
      }),
      { persist: false },
    )
    const data = await loadReferenceData()
    const newStrategy = data?.personStrategyData.find((item) => item.id === personStrategyId)
    if (newStrategy) {
      await applyPersonStrategySelection(newStrategy)
    }
  }

  const handleRemovePersonStrategy = async (strategyId: string) => {
    if (scenarioPersonStrategies.length <= 1) {
      setSelectionError('At least one person strategy is required.')
      return
    }
    const confirmed = window.confirm('Remove this person strategy?')
    if (!confirmed) {
      return
    }
    await storage.personStrategyRepo.remove(strategyId)
    await updateScenarioIds(
      (current) => ({
        ...current,
        updatedAt: current.updatedAt,
        personStrategyIds: current.personStrategyIds.filter((id) => id !== strategyId),
      }),
      { persist: false },
    )
    const data = await loadReferenceData()
    const next = data?.personStrategyData[0]
    if (next) {
      await applyPersonStrategySelection(next)
    }
  }

  const handleAddCashAccount = async () => {
    const account = createCashAccount()
    await storage.nonInvestmentAccountRepo.upsert(account)
    const now = Date.now()
    await updateScenarioIds(
      (current) => ({
        ...current,
        updatedAt: now,
        nonInvestmentAccountIds: [...current.nonInvestmentAccountIds, account.id],
      }),
      { persist: true },
    )
    const data = await loadReferenceData()
    const next = data?.cashData.find((item) => item.id === account.id)
    if (next) {
      applyCashAccountSelection(next)
    }
  }

  const handleRemoveCashAccount = async (accountId: string) => {
    if (scenarioCashAccounts.length <= 1) {
      setSelectionError('At least one cash account is required.')
      return
    }
    const confirmed = window.confirm('Remove this cash account?')
    if (!confirmed) {
      return
    }
    await storage.nonInvestmentAccountRepo.remove(accountId)
    const now = Date.now()
    await updateScenarioIds(
      (current) => ({
        ...current,
        updatedAt: now,
        nonInvestmentAccountIds: current.nonInvestmentAccountIds.filter((id) => id !== accountId),
      }),
      { persist: true },
    )
    const data = await loadReferenceData()
    const next = data?.cashData[0]
    if (next) {
      applyCashAccountSelection(next)
    }
  }

  const handleAddInvestmentAccount = async () => {
    const account = createInvestmentAccount()
    await storage.investmentAccountRepo.upsert(account)
    const holding = createHolding(account.id)
    await storage.investmentAccountHoldingRepo.upsert(holding)
    const now = Date.now()
    await updateScenarioIds(
      (current) => ({
        ...current,
        updatedAt: now,
        investmentAccountIds: [...current.investmentAccountIds, account.id],
      }),
      { persist: true },
    )
    const data = await loadReferenceData()
    const next = data?.investmentData.find((item) => item.id === account.id)
    if (next) {
      await applyInvestmentAccountSelection(next)
    }
  }

  const handleRemoveInvestmentAccount = async (accountId: string) => {
    if (scenarioInvestmentAccounts.length <= 1) {
      setSelectionError('At least one investment account is required.')
      return
    }
    const confirmed = window.confirm('Remove this investment account and its holdings?')
    if (!confirmed) {
      return
    }
    const accountHoldings = await storage.investmentAccountHoldingRepo.listForAccount(accountId)
    await Promise.all(
      accountHoldings.map((holding) => storage.investmentAccountHoldingRepo.remove(holding.id)),
    )
    await storage.investmentAccountRepo.remove(accountId)
    const now = Date.now()
    await updateScenarioIds(
      (current) => ({
        ...current,
        updatedAt: now,
        investmentAccountIds: current.investmentAccountIds.filter((id) => id !== accountId),
      }),
      { persist: true },
    )
    const data = await loadReferenceData()
    const next = data?.investmentData[0]
    if (next) {
      await applyInvestmentAccountSelection(next)
    }
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
        {(personStrategyIds ?? scenario?.personStrategyIds ?? []).map((id, index) => (
          <input key={id} type="hidden" {...register(`scenario.personStrategyIds.${index}`)} />
        ))}
        {(nonInvestmentAccountIds ?? scenario?.nonInvestmentAccountIds ?? []).map((id, index) => (
          <input
            key={id}
            type="hidden"
            {...register(`scenario.nonInvestmentAccountIds.${index}`)}
          />
        ))}
        {(investmentAccountIds ?? scenario?.investmentAccountIds ?? []).map((id, index) => (
          <input
            key={id}
            type="hidden"
            {...register(`scenario.investmentAccountIds.${index}`)}
          />
        ))}
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
        </div>

        <div className="stack">
          <div className="row">
            <h2>Person strategies</h2>
            <button className="button secondary" type="button" onClick={handleAddPersonStrategy}>
              Add person strategy
            </button>
          </div>
          {scenarioPersonStrategies.length === 0 ? (
            <p className="muted">No person strategies yet. Create one from People.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Date of birth</th>
                  <th>Life expectancy</th>
                  <th>Social Security age</th>
                  <th>Work strategy</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {scenarioPersonStrategies.map((strategy) => {
                  const person = peopleById.get(strategy.personId)
                  const socialSecurity = socialSecurityById.get(strategy.socialSecurityStrategyId)
                  const futureWork = futureWorkById.get(strategy.futureWorkStrategyId)
                  return (
                    <tr key={strategy.id}>
                      <td>
                        {person ? (
                          <Link className="link" to={`/people/${person.id}`}>
                            {person.name}
                          </Link>
                        ) : (
                          'Unknown'
                        )}
                      </td>
                      <td>{person?.dateOfBirth ?? '-'}</td>
                      <td>{person?.lifeExpectancy ?? '-'}</td>
                      <td>{socialSecurity?.startAge ?? '-'}</td>
                      <td>{futureWork?.name ?? '-'}</td>
                      <td>
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => void handleRemovePersonStrategy(strategy.id)}
                          >
                            Remove
                          </button>
                        </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="stack">
          <div className="row">
            <h2>Cash accounts</h2>
            <button className="button secondary" type="button" onClick={handleAddCashAccount}>
              Add cash account
            </button>
          </div>
          {scenarioCashAccounts.length === 0 ? (
            <p className="muted">No cash accounts available.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Balance</th>
                  <th>Interest rate</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {scenarioCashAccounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <Link className="link" to={`/accounts/cash/${account.id}`}>
                        {account.name}
                      </Link>
                    </td>
                    <td>{formatCurrency(account.balance)}</td>
                    <td>{account.interestRate}</td>
                    <td>
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => void handleRemoveCashAccount(account.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="stack">
          <div className="row">
            <h2>Investment accounts</h2>
            <button className="button secondary" type="button" onClick={handleAddInvestmentAccount}>
              Add investment account
            </button>
          </div>
          {scenarioInvestmentAccounts.length === 0 ? (
            <p className="muted">No investment accounts available.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Balance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {scenarioInvestmentAccounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <Link className="link" to={`/accounts/investment/${account.id}`}>
                        {account.name}
                      </Link>
                    </td>
                    <td>{formatCurrency(investmentBalances[account.id] ?? 0)}</td>
                    <td>
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => void handleRemoveInvestmentAccount(account.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="stack">
          <label className="field">
            <span>Spending strategy</span>
            <select
              value={selectedSpendingStrategyId ?? ''}
              onChange={(event) => void handleSpendingStrategySelect(event.target.value)}
            >
              {spendingStrategies.length === 0 ? (
                <option value="">No spending strategies available</option>
              ) : null}
              {spendingStrategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name}
                </option>
              ))}
            </select>
          </label>

          {spendingLineItems.length === 0 ? (
            <p className="muted">No spending line items for this strategy.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Need (monthly)</th>
                  <th>Want (monthly)</th>
                  <th>Start</th>
                  <th>End</th>
                </tr>
              </thead>
              <tbody>
                {spendingLineItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.category}</td>
                    <td>{formatCurrency(item.needAmount)}</td>
                    <td>{formatCurrency(item.wantAmount)}</td>
                    <td>{item.startDate}</td>
                    <td>{item.endDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
