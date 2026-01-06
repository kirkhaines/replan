import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useFieldArray, useForm, type SubmitErrorHandler } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  scenarioSchema,
  inflationTypeSchema,
  taxTypeSchema,
  taxTreatmentSchema,
  normalizeScenarioStrategies,
  type InflationDefault,
  type Scenario,
  type SimulationRun,
  type SimulationSnapshot,
  type Person,
  type SocialSecurityStrategy,
  type FutureWorkStrategy,
  type SpendingStrategy,
  type SpendingLineItem,
  type NonInvestmentAccount,
  type InvestmentAccount,
  type InvestmentAccountHolding,
  type PersonStrategy,
} from '../../core/models'
import { useAppStore } from '../../state/appStore'
import type { SimulationRequest } from '../../core/sim/input'
import type { StorageClient } from '../../core/storage/types'
import { createDefaultScenarioBundle } from './scenarioDefaults'
import { createUuid } from '../../core/utils/uuid'
import PageHeader from '../../components/PageHeader'
import useUnsavedChangesWarning from '../../hooks/useUnsavedChangesWarning'
import {
  inflationDefaultsSeed,
  taxPolicySeed,
  irmaaTableSeed,
  rmdTableSeed,
} from '../../core/defaults/defaultData'

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

const addYearsToIsoDate = (isoDate: string, years: number) => {
  const date = new Date(isoDate)
  date.setFullYear(date.getFullYear() + years)
  return date.toISOString().slice(0, 10)
}

const getAgeInYearsAtDate = (dateOfBirth: string, dateValue: string) => {
  const birth = new Date(dateOfBirth)
  const target = new Date(dateValue)
  let months =
    (target.getFullYear() - birth.getFullYear()) * 12 +
    (target.getMonth() - birth.getMonth())
  if (target.getDate() < birth.getDate()) {
    months -= 1
  }
  return Math.max(0, Math.round((months / 12) * 10) / 10)
}

const normalizeSocialSecurityStrategy = (
  strategy: SocialSecurityStrategy,
  person: Person,
): SocialSecurityStrategy => {
  const legacy = strategy as SocialSecurityStrategy & { startAge?: number }
  if (strategy.startDate) {
    return strategy
  }
  const startAge = legacy.startAge ?? 67
  return {
    ...strategy,
    startDate: addYearsToIsoDate(person.dateOfBirth, startAge),
  }
}

type ScenarioEditorValues = {
  scenario: Scenario
}

const editorSchema = z.object({
  scenario: scenarioSchema,
})

const isDefined = <T,>(value: T | undefined): value is T => Boolean(value)

const buildSimulationSnapshot = async (
  scenario: Scenario,
  storage: StorageClient,
  normalizeSocial: (strategy: SocialSecurityStrategy, person: Person) => SocialSecurityStrategy,
): Promise<SimulationSnapshot> => {
  const legacyInflation = (
    scenario as Scenario & {
      inflationAssumptions?: Scenario['strategies']['returnModel']['inflationAssumptions']
    }
  ).inflationAssumptions
  const inflationAssumptions = buildInflationMap(
    inflationDefaultsSeed,
    scenario.strategies?.returnModel?.inflationAssumptions ?? legacyInflation,
  )
  const normalizedScenario = {
    ...scenario,
    strategies: normalizeScenarioStrategies({
      ...scenario.strategies,
      returnModel: {
        ...scenario.strategies.returnModel,
        inflationAssumptions,
      },
    }),
  }
  const personStrategies = (
    await Promise.all(
      normalizedScenario.personStrategyIds.map((id) => storage.personStrategyRepo.get(id)),
    )
  ).filter(isDefined)

  const people = (
    await Promise.all(personStrategies.map((strategy) => storage.personRepo.get(strategy.personId)))
  ).filter(isDefined)

  const socialSecurityStrategies = (
    await Promise.all(
      personStrategies.map((strategy) =>
        storage.socialSecurityStrategyRepo.get(strategy.socialSecurityStrategyId),
      ),
    )
  )
    .filter(isDefined)
    .map((strategy) => {
      const person = people.find((entry) => entry.id === strategy.personId)
      return person ? normalizeSocial(strategy, person) : strategy
    })

  const futureWorkStrategies = (
    await Promise.all(
      personStrategies.map((strategy) =>
        storage.futureWorkStrategyRepo.get(strategy.futureWorkStrategyId),
      ),
    )
  ).filter(isDefined)

  const futureWorkPeriods = (
    await Promise.all(
      futureWorkStrategies.map((strategy) =>
        storage.futureWorkPeriodRepo.listForStrategy(strategy.id),
      ),
    )
  ).flat()

  const socialSecurityEarnings = (
    await Promise.all(
      people.map((person) => storage.socialSecurityEarningsRepo.listForPerson(person.id)),
    )
  ).flat()

  const spendingStrategy = await storage.spendingStrategyRepo.get(
    normalizedScenario.spendingStrategyId,
  )
  const spendingStrategies = spendingStrategy ? [spendingStrategy] : []
  const spendingLineItems = spendingStrategy
    ? await storage.spendingLineItemRepo.listForStrategy(spendingStrategy.id)
    : []

  const nonInvestmentAccounts = (
    await Promise.all(
      normalizedScenario.nonInvestmentAccountIds.map((id) =>
        storage.nonInvestmentAccountRepo.get(id),
      ),
    )
  ).filter(isDefined)

  const investmentAccounts = (
    await Promise.all(
      normalizedScenario.investmentAccountIds.map((id) =>
        storage.investmentAccountRepo.get(id),
      ),
    )
  ).filter(isDefined)

  const investmentAccountHoldings = (
    await Promise.all(
      investmentAccounts.map((account) =>
        storage.investmentAccountHoldingRepo.listForAccount(account.id),
      ),
    )
  ).flat()

  const [ssaWageIndex, ssaBendPoints, ssaRetirementAdjustments] = await Promise.all([
    storage.ssaWageIndexRepo.list(),
    storage.ssaBendPointRepo.list(),
    storage.ssaRetirementAdjustmentRepo.list(),
  ])

  return {
    scenario: normalizedScenario,
    people,
    personStrategies,
    socialSecurityStrategies,
    socialSecurityEarnings,
    futureWorkStrategies,
    futureWorkPeriods,
    spendingStrategies,
    spendingLineItems,
    nonInvestmentAccounts,
    investmentAccounts,
    investmentAccountHoldings,
    ssaWageIndex,
    ssaBendPoints,
    ssaRetirementAdjustments,
    taxPolicies: taxPolicySeed,
    irmaaTables: irmaaTableSeed,
    rmdTable: rmdTableSeed,
  }
}

const normalizeSpendingLineItem = (item: SpendingLineItem): SpendingLineItem => ({
  ...item,
  inflationType: item.inflationType ?? 'cpi',
  targetInvestmentAccountHoldingId: item.targetInvestmentAccountHoldingId ?? null,
})

const normalizeHolding = (holding: InvestmentAccountHolding): InvestmentAccountHolding => ({
  ...holding,
  contributionBasis: holding.contributionBasis ?? 0,
  returnRate:
    holding.returnRate ?? (holding as InvestmentAccountHolding & { return?: number }).return ?? 0,
  returnStdDev:
    holding.returnStdDev ?? (holding as InvestmentAccountHolding & { risk?: number }).risk ?? 0,
})


const buildInflationMap = (
  defaults: InflationDefault[],
  current?: Scenario['strategies']['returnModel']['inflationAssumptions'],
): Scenario['strategies']['returnModel']['inflationAssumptions'] => {
  const fallback = defaults.length > 0 ? defaults : inflationDefaultsSeed
  return Object.fromEntries(
    inflationTypeSchema.options.map((type) => [
      type,
      current?.[type] ?? fallback.find((item) => item.type === type)?.rate ?? 0,
    ]),
  ) as Scenario['strategies']['returnModel']['inflationAssumptions']
}

const normalizeValues = (values: ScenarioEditorValues, now: number): ScenarioEditorValues => ({
  scenario: {
    ...values.scenario,
    updatedAt: now,
    strategies: normalizeScenarioStrategies(values.scenario.strategies),
  },
})

const persistBundle = async (
  values: ScenarioEditorValues,
  storage: StorageClient,
  setScenario: (scenario: Scenario) => void,
  reset: (values: ScenarioEditorValues) => void,
) => {
  const now = Date.now()
  const normalized = normalizeValues(values, now)

  await storage.scenarioRepo.upsert(normalized.scenario)

  setScenario(normalized.scenario)
  reset(normalized)
  return normalized
}

const ScenarioDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const storage = useAppStore((state) => state.storage)
  const simClient = useAppStore((state) => state.simClient)
  const backTo = (location.state as { from?: string } | null)?.from ?? '/scenarios'
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
  const [inflationDefaults, setInflationDefaults] = useState<InflationDefault[]>([])
  const [selectedCashAccountId, setSelectedCashAccountId] = useState('')
  const [selectedInvestmentAccountId, setSelectedInvestmentAccountId] = useState('')
  const inflationDefaultsRef = useRef<InflationDefault[]>([])

  const defaultValues = useMemo(() => {
    const bundle = createDefaultScenarioBundle()
    return { scenario: bundle.scenario }
  }, [])

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ScenarioEditorValues>({
    resolver: zodResolver(editorSchema),
    defaultValues,
  })

  useUnsavedChangesWarning(isDirty)

  const selectedSpendingStrategyId = watch('scenario.spendingStrategyId')
  const inflationAssumptions = watch('scenario.strategies.returnModel.inflationAssumptions')
  const personStrategyIds = watch('scenario.personStrategyIds')
  const nonInvestmentAccountIds = watch('scenario.nonInvestmentAccountIds')
  const investmentAccountIds = watch('scenario.investmentAccountIds')
  const {
    fields: glidepathTargetFields,
    append: appendGlidepathTarget,
    remove: removeGlidepathTarget,
    replace: replaceGlidepathTargets,
  } = useFieldArray({
    control,
    name: 'scenario.strategies.glidepath.targets',
  })
  const {
    fields: eventRows,
    append: appendEvent,
    remove: removeEvent,
    replace: replaceEvents,
  } = useFieldArray({
    control,
    name: 'scenario.strategies.events',
  })
  const {
    fields: pensionRows,
    append: appendPension,
    remove: removePension,
    replace: replacePensions,
  } = useFieldArray({
    control,
    name: 'scenario.strategies.pensions',
  })

  const spendingSummaryRows = useMemo(() => {
    if (spendingLineItems.length === 0) {
      return []
    }

    const dayMs = 24 * 60 * 60 * 1000
    const parseDate = (value?: string | null) => {
      if (!value) {
        return null
      }
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? null : date.getTime()
    }

    const boundaries = new Set<number>()
    spendingLineItems.forEach((item) => {
      const start = parseDate(item.startDate)
      const end = parseDate(item.endDate)
      if (start !== null) {
        boundaries.add(start)
      }
      if (end !== null) {
        boundaries.add(end)
      }
    })

    const sorted = Array.from(boundaries).sort((a, b) => a - b)
    const intervals: Array<{ start: number | null; end: number | null }> = []
    let cursor: number | null = null
    sorted.forEach((point) => {
      intervals.push({ start: cursor, end: point })
      cursor = point
    })
    intervals.push({ start: cursor, end: null })

    return intervals
      .map((interval) => {
        const sample =
          interval.start !== null
            ? interval.start
            : interval.end !== null
              ? interval.end - dayMs
              : null
        const effectiveItems =
          sample === null
            ? spendingLineItems
            : spendingLineItems.filter((item) => {
                const start = parseDate(item.startDate)
                const end = parseDate(item.endDate)
                const startsBefore = start === null || sample >= start
                const endsAfter = end === null || sample < end
                return startsBefore && endsAfter
              })

        if (effectiveItems.length === 0) {
          return null
        }

        const needTotal = effectiveItems.reduce((sum, item) => sum + item.needAmount, 0)
        const wantTotal = effectiveItems.reduce((sum, item) => sum + item.wantAmount, 0)

        const formatDate = (value: number | null, offsetDays = 0) => {
          if (value === null) {
            return 'Open'
          }
          const date = new Date(value + offsetDays * dayMs)
          return date.toISOString().slice(0, 10)
        }

        const startLabel = interval.start !== null ? formatDate(interval.start) : 'Open'
        const endLabel = interval.end !== null ? formatDate(interval.end, -1) : 'Open'

        return {
          startLabel,
          endLabel,
          needTotal,
          wantTotal,
        }
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
  }, [spendingLineItems])

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

  const availableCashAccounts = useMemo(() => {
    const ids = new Set(scenario?.nonInvestmentAccountIds ?? [])
    return cashAccounts.filter((account) => !ids.has(account.id))
  }, [cashAccounts, scenario?.nonInvestmentAccountIds])

  const availableInvestmentAccounts = useMemo(() => {
    const ids = new Set(scenario?.investmentAccountIds ?? [])
    return investmentAccounts.filter((account) => !ids.has(account.id))
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
      inflationData,
    ] = await Promise.all([
      storage.personRepo.list(),
      storage.personStrategyRepo.list(),
      storage.socialSecurityStrategyRepo.list(),
      storage.futureWorkStrategyRepo.list(),
      storage.spendingStrategyRepo.list(),
      storage.nonInvestmentAccountRepo.list(),
      storage.investmentAccountRepo.list(),
      storage.investmentAccountHoldingRepo.list(),
      storage.inflationDefaultRepo.list(),
    ])
    setPeople(peopleData)
    setPersonStrategies(personStrategyData)
    const normalizedSocial = socialSecurityData.map((strategy) => {
      const person = peopleData.find((entry) => entry.id === strategy.personId)
      return person ? normalizeSocialSecurityStrategy(strategy, person) : strategy
    })
    setSocialSecurityStrategies(normalizedSocial)
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
    setInflationDefaults(inflationData)
    return {
      peopleData,
      personStrategyData,
      spendingStrategyData,
      cashData,
      investmentData,
      holdingData,
    }
  }, [storage])

  const inflationByType = useMemo(
    () => new Map(inflationDefaults.map((item) => [item.type, item])),
    [inflationDefaults],
  )

  const handleInflationChange = (type: InflationDefault['type'], value: number) => {
    setValue(`scenario.strategies.returnModel.inflationAssumptions.${type}`, value, {
      shouldDirty: true,
    })
  }

  const loadHoldingsForAccount = useCallback(
    async (accountId: string) =>
      (await storage.investmentAccountHoldingRepo.listForAccount(accountId)).map(
        normalizeHolding,
      ),
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

  const ensureInvestmentAccountHoldings = useCallback(
    async (accountId: string) => {
      const list = await loadHoldingsForAccount(accountId)
      if (list.length > 0) {
        setSelectionError(null)
        return true
      }
      setSelectionError('Selected investment account has no holdings.')
      return false
    },
    [loadHoldingsForAccount],
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
    const investmentAccountHoldings = (
      await storage.investmentAccountHoldingRepo.listForAccount(investmentAccount.id)
    ).map(normalizeHolding)

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

    const legacyInflation = (
      data as Scenario & {
        inflationAssumptions?: Scenario['strategies']['returnModel']['inflationAssumptions']
      }
    ).inflationAssumptions
    const inflationAssumptions = buildInflationMap(
      inflationDefaultsRef.current,
      data.strategies?.returnModel?.inflationAssumptions ?? legacyInflation,
    )
    const normalizedScenario = {
      ...data,
      strategies: normalizeScenarioStrategies({
        ...data.strategies,
        returnModel: {
          ...data.strategies?.returnModel,
          inflationAssumptions,
        },
      }),
    }
    setScenario(normalizedScenario)
    reset({ scenario: normalizedScenario })
    replaceGlidepathTargets(normalizedScenario.strategies.glidepath.targets)
    replaceEvents(normalizedScenario.strategies.events)
    replacePensions(normalizedScenario.strategies.pensions)
    setSpendingLineItems(spendingLineItems.map(normalizeSpendingLineItem))
    setSelectionError(null)
    setIsLoading(false)
  }, [id, replaceEvents, replaceGlidepathTargets, replacePensions, reset, storage])

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
    inflationDefaultsRef.current = inflationDefaults
  }, [inflationDefaults])

  useEffect(() => {
    void loadScenario()
  }, [loadScenario])

  useEffect(() => {
    if (availableCashAccounts.length === 0) {
      setSelectedCashAccountId('')
      return
    }
    if (!availableCashAccounts.some((account) => account.id === selectedCashAccountId)) {
      setSelectedCashAccountId(availableCashAccounts[0].id)
    }
  }, [availableCashAccounts, selectedCashAccountId])

  useEffect(() => {
    if (availableInvestmentAccounts.length === 0) {
      setSelectedInvestmentAccountId('')
      return
    }
    if (
      !availableInvestmentAccounts.some((account) => account.id === selectedInvestmentAccountId)
    ) {
      setSelectedInvestmentAccountId(availableInvestmentAccounts[0].id)
    }
  }, [availableInvestmentAccounts, selectedInvestmentAccountId])

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
    setValue('scenario.spendingStrategyId', strategy.id, { shouldDirty: true })
    const items = await loadSpendingLineItemsForStrategy(strategy.id)
    setSpendingLineItems(items.map(normalizeSpendingLineItem))
    if (items.length > 0) {
      setSelectionError(null)
    } else {
      setSelectionError('Selected spending strategy has no line items.')
    }
  }

  const handleAddSpendingStrategy = async () => {
    const now = Date.now()
    const strategy: SpendingStrategy = {
      id: createUuid(),
      name: 'New spending strategy',
      createdAt: now,
      updatedAt: now,
    }
    await storage.spendingStrategyRepo.upsert(strategy)
    await loadReferenceData()
    navigate(`/spending-strategies/${strategy.id}`, { state: { from: location.pathname } })
  }

  const handleAddPersonStrategy = async () => {
    if (!scenario) {
      setSelectionError('Scenario data is not loaded yet.')
      return
    }
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
      startDate: addYearsToIsoDate('1985-01-01', 67),
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
      scenarioId: scenario.id,
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
      setSelectionError(null)
    }
    navigate(`/person-strategies/${personStrategyId}`, {
      state: { from: location.pathname, scenarioId: scenario?.id ?? id },
    })
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
      setSelectionError(null)
    }
  }

  const handleAddCashAccount = async () => {
    if (!scenario) {
      setSelectionError('Scenario data is not loaded yet.')
      return
    }
    const account = cashAccounts.find((item) => item.id === selectedCashAccountId)
    if (!account) {
      setSelectionError('Select a cash account to add.')
      return
    }
    if (scenario.nonInvestmentAccountIds.includes(account.id)) {
      setSelectionError('Cash account is already linked to this scenario.')
      return
    }
    const now = Date.now()
    await updateScenarioIds(
      (current) => ({
        ...current,
        updatedAt: now,
        nonInvestmentAccountIds: [...current.nonInvestmentAccountIds, account.id],
      }),
      { persist: true },
    )
    await loadReferenceData()
    setSelectionError(null)
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
    if (!scenario) {
      setSelectionError('Scenario data is not loaded yet.')
      return
    }
    const account = investmentAccounts.find((item) => item.id === selectedInvestmentAccountId)
    if (!account) {
      setSelectionError('Select an investment account to add.')
      return
    }
    if (scenario.investmentAccountIds.includes(account.id)) {
      setSelectionError('Investment account is already linked to this scenario.')
      return
    }
    const holdings = await loadHoldingsForAccount(account.id)
    if (holdings.length === 0) {
      setSelectionError('Selected investment account has no holdings.')
      return
    }
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
      await ensureInvestmentAccountHoldings(next.id)
    }
    setSelectionError(null)
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
      await ensureInvestmentAccountHoldings(next.id)
    }
  }


  const onInvalid: SubmitErrorHandler<ScenarioEditorValues> = (formErrors) => {
    console.warn('[Scenario] Save blocked by validation errors.', formErrors)
  }

  const onSubmit = async (values: ScenarioEditorValues) => {
    console.info('[Scenario] Save requested.', {
      id: values.scenario.id,
      name: values.scenario.name,
      eventCount: values.scenario.strategies.events.length,
      pensionCount: values.scenario.strategies.pensions.length,
      isDirty,
    })
    try {
      const saved = await persistBundle(values, storage, setScenario, reset)
      console.info('[Scenario] Save complete.', {
        id: saved.scenario.id,
        updatedAt: saved.scenario.updatedAt,
      })
    } catch (error) {
      console.error('[Scenario] Save failed.', error)
      throw error
    }
  }

  const onRun = async (values: ScenarioEditorValues) => {
    const saved = await persistBundle(values, storage, setScenario, reset)
    const snapshot = await buildSimulationSnapshot(
      saved.scenario,
      storage,
      normalizeSocialSecurityStrategy,
    )
    const input: SimulationRequest = {
      snapshot,
      // Default to today's date until scenarios have a configurable start date.
      startDate: new Date().toISOString().slice(0, 10),
    }
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
        <Link className="link" to={backTo}>
          Back to scenarios
        </Link>
      </section>
    )
  }

  if (!scenario) {
    return (
      <section className="stack">
        <h1>Scenario not found</h1>
        <Link className="link" to={backTo}>
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
          <Link className="link" to={backTo}>
            Back
          </Link>
        }
      />

      {selectionError ? (
        <div className="card">
          <p className="error">{selectionError}</p>
        </div>
      ) : null}

      <form className="card stack" onSubmit={handleSubmit(onSubmit, onInvalid)}>
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
        {inflationTypeSchema.options.map((type) => (
          <input
            key={type}
            type="hidden"
            {...register(`scenario.strategies.returnModel.inflationAssumptions.${type}`, {
              valueAsNumber: true,
            })}
          />
        ))}

        <div className="form-grid">
          <label className="field">
            <span>Scenario name</span>
            <input {...register('scenario.name')} />
            {errors.scenario?.name ? (
              <span className="error">{errors.scenario.name.message}</span>
            ) : null}
          </label>
        </div>

        <div className="stack">
          <div className="row">
            <h2>People</h2>
            <button className="button secondary" type="button" onClick={handleAddPersonStrategy}>
              Add person
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
                  <th>Social Security start</th>
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
                          <Link
                            className="link"
                            to={`/person-strategies/${strategy.id}`}
                            state={{ from: location.pathname, scenarioId: scenario?.id }}
                          >
                            {person.name}
                          </Link>
                        ) : (
                          'Unknown'
                        )}
                      </td>
                      <td>{person?.dateOfBirth ?? '-'}</td>
                      <td>{person?.lifeExpectancy ?? '-'}</td>
                      <td>
                        {person && socialSecurity?.startDate
                          ? `${socialSecurity.startDate} (age ${getAgeInYearsAtDate(
                              person.dateOfBirth,
                              socialSecurity.startDate,
                            )})`
                          : '-'}
                      </td>
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
            <div className="button-row">
              <select
                aria-label="Add cash account"
                value={selectedCashAccountId}
                onChange={(event) => setSelectedCashAccountId(event.target.value)}
                disabled={availableCashAccounts.length === 0}
              >
                {availableCashAccounts.length === 0 ? (
                  <option value="">No cash accounts available</option>
                ) : null}
                {availableCashAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              <button
                className="button secondary"
                type="button"
                onClick={handleAddCashAccount}
                disabled={!selectedCashAccountId}
              >
                Add cash account
              </button>
            </div>
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
                      <Link
                        className="link"
                        to={`/accounts/cash/${account.id}`}
                        state={{ from: location.pathname }}
                      >
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
            <div className="button-row">
              <select
                aria-label="Add investment account"
                value={selectedInvestmentAccountId}
                onChange={(event) => setSelectedInvestmentAccountId(event.target.value)}
                disabled={availableInvestmentAccounts.length === 0}
              >
                {availableInvestmentAccounts.length === 0 ? (
                  <option value="">No investment accounts available</option>
                ) : null}
                {availableInvestmentAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              <button
                className="button secondary"
                type="button"
                onClick={handleAddInvestmentAccount}
                disabled={!selectedInvestmentAccountId}
              >
                Add investment account
              </button>
            </div>
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
                      <Link
                        className="link"
                        to={`/accounts/investment/${account.id}`}
                        state={{ from: location.pathname }}
                      >
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
          <div className="row">
            <h2>Spending strategy</h2>
          </div>
          <div className="row">
            <label className="field">
              <span>Strategy</span>
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
            <button
              className="button secondary"
              type="button"
              disabled={!selectedSpendingStrategyId}
              onClick={() =>
                selectedSpendingStrategyId
                  ? navigate(`/spending-strategies/${selectedSpendingStrategyId}`, {
                      state: { from: location.pathname },
                    })
                  : null
              }
            >
              Edit spending strategy
            </button>
            <button className="button secondary" type="button" onClick={handleAddSpendingStrategy}>
              Add spending strategy
            </button>
          </div>

          {spendingSummaryRows.length === 0 ? (
            <p className="muted">No spending line items for this strategy.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Start</th>
                  <th>End</th>
                  <th>Need total (monthly)</th>
                  <th>Want total (monthly)</th>
                </tr>
              </thead>
              <tbody>
                {spendingSummaryRows.map((row) => (
                  <tr key={`${row.startLabel}-${row.endLabel}`}>
                    <td>{row.startLabel}</td>
                    <td>{row.endLabel}</td>
                    <td>{formatCurrency(row.needTotal)}</td>
                    <td>{formatCurrency(row.wantTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="stack">
          <div className="row">
            <h2>Simulation strategies</h2>
          </div>

          <div className="stack">
            <h3>Market</h3>
            <div className="form-grid">
              <label className="field">
                <span>Return model</span>
                <select {...register('scenario.strategies.returnModel.mode')}>
                  <option value="deterministic">Deterministic</option>
                  <option value="stochastic">Stochastic</option>
                  <option value="historical">Historical</option>
                </select>
              </label>
              <label className="field">
                <span>Sequence model</span>
                <select {...register('scenario.strategies.returnModel.sequenceModel')}>
                  <option value="independent">Independent</option>
                  <option value="regime">Regime</option>
                </select>
              </label>
              <label className="field">
                <span>Volatility scale</span>
                <input
                  type="number"
                  step="0.01"
                  {...register('scenario.strategies.returnModel.volatilityScale', {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label className="field">
                <span>Correlation model</span>
                <select {...register('scenario.strategies.returnModel.correlationModel')}>
                  <option value="none">None</option>
                  <option value="asset_class">Asset class</option>
                </select>
              </label>
              <label className="field">
                <span>Cash yield rate</span>
                <input
                  type="number"
                  step="0.001"
                  {...register('scenario.strategies.returnModel.cashYieldRate', {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label className="field">
                <span>Return seed</span>
                <input
                  type="number"
                  {...register('scenario.strategies.returnModel.seed', {
                    setValueAs: (value) => (value === '' ? undefined : Number(value)),
                  })}
                />
              </label>
              {inflationTypeSchema.options.map((type) => {
                const currentValue =
                  inflationAssumptions?.[type] ?? inflationByType.get(type)?.rate ?? 0
                return (
                  <label className="field" key={type}>
                    <span>{type} inflation</span>
                    <input
                      type="number"
                      step="0.001"
                      value={currentValue}
                      onChange={(event) =>
                        handleInflationChange(type, Number(event.target.value))
                      }
                    />
                  </label>
                )
              })}
            </div>
          </div>

          <div className="stack">
            <h3>Allocation</h3>
            <div className="form-grid">
              <label className="field">
                <span>Glidepath mode</span>
                <select {...register('scenario.strategies.glidepath.mode')}>
                  <option value="age">Age</option>
                  <option value="year">Year</option>
                </select>
              </label>
              <label className="field">
                <span>Glidepath scope</span>
                <select {...register('scenario.strategies.glidepath.scope')}>
                  <option value="global">Global</option>
                  <option value="per_account">Per account</option>
                </select>
              </label>
            </div>
          </div>

          <div className="stack">
            <div className="row">
              <h3>Glidepath targets</h3>
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  appendGlidepathTarget({
                    age: 65,
                    equity: 0.6,
                    bonds: 0.3,
                    cash: 0.05,
                    realEstate: 0.05,
                    other: 0,
                  })
                }
              >
                Add target
              </button>
            </div>
            {glidepathTargetFields.length === 0 ? (
              <p className="muted">No glidepath targets yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Age</th>
                    <th>Equity</th>
                    <th>Bonds</th>
                    <th>Cash</th>
                    <th>Real estate</th>
                    <th>Other</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {glidepathTargetFields.map((field, index) => (
                    <tr key={field.id}>
                      <td>
                        <input
                          type="number"
                          defaultValue={field.age}
                          {...register(
                            `scenario.strategies.glidepath.targets.${index}.age`,
                            { valueAsNumber: true },
                          )}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={field.equity}
                          {...register(
                            `scenario.strategies.glidepath.targets.${index}.equity`,
                            { valueAsNumber: true },
                          )}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={field.bonds}
                          {...register(
                            `scenario.strategies.glidepath.targets.${index}.bonds`,
                            { valueAsNumber: true },
                          )}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={field.cash}
                          {...register(
                            `scenario.strategies.glidepath.targets.${index}.cash`,
                            { valueAsNumber: true },
                          )}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={field.realEstate}
                          {...register(
                            `scenario.strategies.glidepath.targets.${index}.realEstate`,
                            { valueAsNumber: true },
                          )}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={field.other}
                          {...register(
                            `scenario.strategies.glidepath.targets.${index}.other`,
                            { valueAsNumber: true },
                          )}
                        />
                      </td>
                      <td>
                        <button
                          className="link-button"
                          type="button"
                          disabled={glidepathTargetFields.length <= 1}
                          onClick={() => removeGlidepathTarget(index)}
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
            <div className="form-grid">
              <label className="field">
                <span>Rebalance frequency</span>
                <select {...register('scenario.strategies.rebalancing.frequency')}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                  <option value="threshold">Threshold</option>
                </select>
              </label>
              <label className="field">
                <span>Drift threshold</span>
                <input
                  type="number"
                  step="0.01"
                  {...register('scenario.strategies.rebalancing.driftThreshold', {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label className="field">
                <span>Min trade amount</span>
                <input
                  type="number"
                  {...register('scenario.strategies.rebalancing.minTradeAmount', {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label className="field checkbox">
                <input type="checkbox" {...register('scenario.strategies.rebalancing.useContributions')} />
                <span>Use contributions first</span>
              </label>
              <label className="field checkbox">
                <input type="checkbox" {...register('scenario.strategies.rebalancing.taxAware')} />
                <span>Tax aware</span>
              </label>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Cash buffer target (months)</span>
                <input
                  type="number"
                  {...register('scenario.strategies.cashBuffer.targetMonths', {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label className="field">
                <span>Cash buffer min (months)</span>
                <input
                  type="number"
                  {...register('scenario.strategies.cashBuffer.minMonths', {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label className="field">
                <span>Cash buffer max (months)</span>
                <input
                  type="number"
                  {...register('scenario.strategies.cashBuffer.maxMonths', {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label className="field">
                <span>Refill priority</span>
                <select {...register('scenario.strategies.cashBuffer.refillPriority')}>
                  <option value="taxable_first">Taxable first</option>
                  <option value="tax_deferred_first">Tax deferred first</option>
                  <option value="pro_rata">Pro rata</option>
                </select>
              </label>
            </div>
          </div>

          <div className="stack">
            <h3>Withdrawals and conversions</h3>
            <div className="stack">
              <h4>Withdrawal order</h4>
              <div className="form-grid">
                <label className="field">
                  <span>Withdrawal order 1</span>
                  <select {...register('scenario.strategies.withdrawal.order.0')}>
                    {taxTypeSchema.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Withdrawal order 2</span>
                  <select {...register('scenario.strategies.withdrawal.order.1')}>
                    {taxTypeSchema.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Withdrawal order 3</span>
                  <select {...register('scenario.strategies.withdrawal.order.2')}>
                    {taxTypeSchema.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Withdrawal order 4</span>
                  <select {...register('scenario.strategies.withdrawal.order.3')}>
                    {taxTypeSchema.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="stack">
              <h4>Withdrawal guardrails</h4>
              <div className="form-grid">
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    {...register('scenario.strategies.withdrawal.useCashFirst')}
                  />
                  <span>Use cash first</span>
                </label>
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    {...register('scenario.strategies.withdrawal.avoidEarlyPenalty')}
                  />
                  <span>Avoid early penalties</span>
                </label>
                <label className="field">
                  <span>Guardrail percent</span>
                  <input
                    type="number"
                    step="0.01"
                    {...register('scenario.strategies.withdrawal.guardrailPct', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className="field">
                  <span>Taxable gain harvest target</span>
                  <input
                    type="number"
                    {...register('scenario.strategies.withdrawal.taxableGainHarvestTarget', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
              </div>
            </div>

            <div className="stack">
              <h4>Taxable lots</h4>
              <div className="form-grid">
                <label className="field">
                  <span>Cost basis method</span>
                  <select {...register('scenario.strategies.taxableLot.costBasisMethod')}>
                    <option value="average">Average</option>
                    <option value="fifo">FIFO</option>
                    <option value="lifo">LIFO</option>
                  </select>
                </label>
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    {...register('scenario.strategies.taxableLot.harvestLosses')}
                  />
                  <span>Harvest losses</span>
                </label>
                <label className="field">
                  <span>Gain realization target</span>
                  <input
                    type="number"
                    {...register('scenario.strategies.taxableLot.gainRealizationTarget', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
              </div>
            </div>

            <div className="stack">
              <h4>Early retirement</h4>
              <div className="form-grid">
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    {...register('scenario.strategies.earlyRetirement.useRothBasisFirst')}
                  />
                  <span>Use Roth basis first</span>
                </label>
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    {...register('scenario.strategies.earlyRetirement.allowPenalty')}
                  />
                  <span>Allow early penalties</span>
                </label>
                <label className="field">
                  <span>Penalty rate</span>
                  <input
                    type="number"
                    step="0.01"
                    {...register('scenario.strategies.earlyRetirement.penaltyRate', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    {...register('scenario.strategies.earlyRetirement.use72t')}
                  />
                  <span>Use 72(t)</span>
                </label>
                <label className="field">
                  <span>Bridge cash years</span>
                  <input
                    type="number"
                    {...register('scenario.strategies.earlyRetirement.bridgeCashYears', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
              </div>
            </div>

            <div className="stack">
              <h4>Roth conversions</h4>
              <div className="form-grid">
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    {...register('scenario.strategies.rothConversion.enabled')}
                  />
                  <span>Enable Roth conversions</span>
                </label>
                <label className="field">
                  <span>Conversion start age</span>
                  <input
                    type="number"
                    {...register('scenario.strategies.rothConversion.startAge', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className="field">
                  <span>Conversion end age</span>
                  <input
                    type="number"
                    {...register('scenario.strategies.rothConversion.endAge', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className="field">
                  <span>Target ordinary income</span>
                  <input
                    type="number"
                    {...register('scenario.strategies.rothConversion.targetOrdinaryIncome', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className="field">
                  <span>Min conversion</span>
                  <input
                    type="number"
                    {...register('scenario.strategies.rothConversion.minConversion', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className="field">
                  <span>Max conversion</span>
                  <input
                    type="number"
                    {...register('scenario.strategies.rothConversion.maxConversion', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    {...register('scenario.strategies.rothConversion.respectIrmaa')}
                  />
                  <span>Respect IRMAA</span>
                </label>
              </div>
            </div>

            <div className="stack">
              <h4>Roth ladder</h4>
              <div className="form-grid">
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    {...register('scenario.strategies.rothLadder.enabled')}
                  />
                  <span>Enable Roth ladder</span>
                </label>
                <label className="field">
                  <span>Ladder lead time (years)</span>
                  <input
                    type="number"
                    {...register('scenario.strategies.rothLadder.leadTimeYears', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className="field">
                  <span>Ladder start age</span>
                  <input
                    type="number"
                    {...register('scenario.strategies.rothLadder.startAge', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className="field">
                  <span>Ladder end age</span>
                  <input
                    type="number"
                    {...register('scenario.strategies.rothLadder.endAge', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className="field">
                  <span>Target after-tax spending</span>
                  <input
                    type="number"
                    {...register('scenario.strategies.rothLadder.targetAfterTaxSpending', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className="field">
                  <span>Annual conversion</span>
                  <input
                    type="number"
                    {...register('scenario.strategies.rothLadder.annualConversion', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
              </div>
            </div>

            <div className="stack">
              <h4>Required minimum distributions</h4>
              <div className="form-grid">
                <label className="field checkbox">
                  <input type="checkbox" {...register('scenario.strategies.rmd.enabled')} />
                  <span>Apply RMDs</span>
                </label>
                <label className="field">
                  <span>RMD start age</span>
                  <input
                    type="number"
                    {...register('scenario.strategies.rmd.startAge', { valueAsNumber: true })}
                  />
                </label>
                <label className="field">
                  <span>Excess handling</span>
                  <select {...register('scenario.strategies.rmd.excessHandling')}>
                    <option value="spend">Spend</option>
                    <option value="taxable">Taxable</option>
                    <option value="roth">Roth</option>
                  </select>
                </label>
                <label className="field">
                  <span>Withholding rate</span>
                  <input
                    type="number"
                    step="0.01"
                    {...register('scenario.strategies.rmd.withholdingRate', {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <div className="field">
                  <span>RMD account types</span>
                  <div className="line-item-flags">
                    {taxTypeSchema.options.map((taxType) => (
                      <label className="field checkbox" key={taxType}>
                        <input
                          type="checkbox"
                          value={taxType}
                          {...register('scenario.strategies.rmd.accountTypes')}
                        />
                        <span>{taxType}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="stack">
            <h3>Taxes</h3>
            <div className="form-grid">
              <label className="field">
                <span>Filing status</span>
                <select {...register('scenario.strategies.tax.filingStatus')}>
                  <option value="single">Single</option>
                  <option value="married_joint">Married filing jointly</option>
                  <option value="married_separate">Married filing separately</option>
                  <option value="head_of_household">Head of household</option>
                </select>
              </label>
              <label className="field">
                <span>Policy year</span>
                <input
                  type="number"
                  {...register('scenario.strategies.tax.policyYear', { valueAsNumber: true })}
                />
              </label>
              <label className="field">
                <span>State tax rate</span>
                <input
                  type="number"
                  step="0.001"
                  {...register('scenario.strategies.tax.stateTaxRate', { valueAsNumber: true })}
                />
              </label>
              <label className="field checkbox">
                <input type="checkbox" {...register('scenario.strategies.tax.useStandardDeduction')} />
                <span>Use standard deduction</span>
              </label>
              <label className="field checkbox">
                <input
                  type="checkbox"
                  {...register('scenario.strategies.tax.applyCapitalGainsRates')}
                />
                <span>Apply capital gains rates</span>
              </label>
            </div>
          </div>

          <div className="stack">
            <h3>Healthcare</h3>
            <div className="form-grid">
              <label className="field">
                <span>Pre-Medicare premium</span>
                <input
                  type="number"
                  {...register('scenario.strategies.healthcare.preMedicareMonthly', {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label className="field">
                <span>Medicare Part B</span>
                <input
                  type="number"
                  {...register('scenario.strategies.healthcare.medicarePartBMonthly', {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label className="field">
                <span>Medicare Part D</span>
                <input
                  type="number"
                  {...register('scenario.strategies.healthcare.medicarePartDMonthly', {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label className="field">
                <span>Medigap / MA plan</span>
                <input
                  type="number"
                  {...register('scenario.strategies.healthcare.medigapMonthly', {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label className="field">
                <span>Health inflation</span>
                <select {...register('scenario.strategies.healthcare.inflationType')}>
                  {inflationTypeSchema.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field checkbox">
                <input type="checkbox" {...register('scenario.strategies.healthcare.applyIrmaa')} />
                <span>Apply IRMAA</span>
              </label>
            </div>
          </div>

          <div className="stack">
            <h3>Giving</h3>
            <div className="form-grid">
              <label className="field">
                <span>Annual giving</span>
                <input
                  type="number"
                  {...register('scenario.strategies.charitable.annualGiving', {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label className="field">
                <span>Giving start age</span>
                <input
                  type="number"
                  {...register('scenario.strategies.charitable.startAge', {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label className="field">
                <span>Giving end age</span>
                <input
                  type="number"
                  {...register('scenario.strategies.charitable.endAge', {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <label className="field checkbox">
                <input type="checkbox" {...register('scenario.strategies.charitable.useQcd')} />
                <span>Use QCD</span>
              </label>
              <label className="field">
                <span>QCD annual amount</span>
                <input
                  type="number"
                  {...register('scenario.strategies.charitable.qcdAnnualAmount', {
                    valueAsNumber: true,
                  })}
                />
              </label>
            </div>
          </div>

          <div className="stack">
            <div className="row">
              <h3>Events</h3>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10)
                  appendEvent({
                    id: createUuid(),
                    name: 'Event',
                    date: today,
                    amount: 0,
                    taxTreatment: 'none',
                  })
                }}
              >
                Add event
              </button>
            </div>
            {eventRows.length === 0 ? (
              <p className="muted">No events yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Tax treatment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {eventRows.map((field, index) => (
                    <tr key={field.id}>
                      <td>
                        <input
                          type="hidden"
                          {...register(`scenario.strategies.events.${index}.id`)}
                        />
                        <input
                          defaultValue={field.name}
                          {...register(`scenario.strategies.events.${index}.name`)}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          defaultValue={field.date}
                          {...register(`scenario.strategies.events.${index}.date`)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          defaultValue={field.amount}
                          {...register(`scenario.strategies.events.${index}.amount`, {
                            valueAsNumber: true,
                          })}
                        />
                      </td>
                      <td>
                        <select
                          defaultValue={field.taxTreatment}
                          {...register(`scenario.strategies.events.${index}.taxTreatment`)}
                        >
                          {taxTreatmentSchema.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => removeEvent(index)}
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
              <h3>Pensions</h3>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10)
                  appendPension({
                    id: createUuid(),
                    name: 'Pension',
                    startDate: today,
                    endDate: '',
                    monthlyAmount: 0,
                    inflationType: 'cpi',
                    taxTreatment: 'ordinary',
                  })
                }}
              >
                Add pension
              </button>
            </div>
            {pensionRows.length === 0 ? (
              <p className="muted">No pensions yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Monthly</th>
                    <th>Inflation</th>
                    <th>Tax</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pensionRows.map((field, index) => (
                    <tr key={field.id}>
                      <td>
                        <input
                          type="hidden"
                          {...register(`scenario.strategies.pensions.${index}.id`)}
                        />
                        <input
                          defaultValue={field.name}
                          {...register(`scenario.strategies.pensions.${index}.name`)}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          defaultValue={field.startDate}
                          {...register(`scenario.strategies.pensions.${index}.startDate`)}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          defaultValue={field.endDate ?? ''}
                          {...register(`scenario.strategies.pensions.${index}.endDate`)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          defaultValue={field.monthlyAmount}
                          {...register(`scenario.strategies.pensions.${index}.monthlyAmount`, {
                            valueAsNumber: true,
                          })}
                        />
                      </td>
                      <td>
                        <select
                          defaultValue={field.inflationType}
                          {...register(`scenario.strategies.pensions.${index}.inflationType`)}
                        >
                          {inflationTypeSchema.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          defaultValue={field.taxTreatment}
                          {...register(`scenario.strategies.pensions.${index}.taxTreatment`)}
                        >
                          {taxTreatmentSchema.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => removePension(index)}
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
              <Link
                className="run-item"
                key={run.id}
                to={`/runs/${run.id}`}
                state={{ from: location.pathname }}
              >
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
