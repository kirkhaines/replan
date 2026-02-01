import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useFieldArray, useForm, type Resolver, type SubmitErrorHandler } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  scenarioSchema,
  inflationTypeSchema,
  withdrawalOrderTypeSchema,
  stateTaxCodeSchema,
  beneficiaryRelationshipSchema,
  normalizeScenarioStrategies,
  type InflationDefault,
  type Scenario,
  type SimulationRun,
  type SimulationSnapshot,
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
import type { SimulationRequest } from '../../core/sim/input'
import type { StorageClient } from '../../core/storage/types'
import { createDefaultScenarioBundle } from './scenarioDefaults'
import { createUuid } from '../../core/utils/uuid'
import { hashStringToSeed } from '../../core/sim/random'
import PageHeader from '../../components/PageHeader'
import useUnsavedChangesWarning from '../../hooks/useUnsavedChangesWarning'
import BasicConfigSection from './detail-sections/BasicConfigSection'
import PeopleAssetsSection from './detail-sections/PeopleAssetsSection'
import SpendingSection from './detail-sections/SpendingSection'
import AssetManagementSection from './detail-sections/AssetManagementSection'
import EarlyRetirementSection from './detail-sections/EarlyRetirementSection'
import LegacySection from './detail-sections/LegacySection'
import SimulationRunsSection from './detail-sections/SimulationRunsSection'
import {
  inflationDefaultsSeed,
  taxPolicySeed,
  socialSecurityProvisionalIncomeBracketsSeed,
  irmaaTableSeed,
  rmdTableSeed,
  longTermCareAnnualCostsByLevel,
} from '../../core/defaults/defaultData'
import { remapScenarioSeed } from '../../core/defaults/remapScenarioSeed'
import type { LocalScenarioSeed } from '../../core/defaults/localSeedTypes'
import { selectTaxPolicy } from '../../core/sim/tax'
import type { ScenarioEditorValues, SpendingIntervalRow } from './scenarioEditorTypes'

// ignore-large-file-size

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

const withdrawalOrderLabels: Record<string, string> = {
  taxable: 'Taxable',
  traditional: 'Traditional',
  roth_basis: 'Roth basis',
  roth: 'Roth',
  hsa: 'HSA',
}

const withdrawalOrderOptions = withdrawalOrderTypeSchema.options.map((option) => ({
  value: option,
  label: withdrawalOrderLabels[option] ?? option.replace('_', ' '),
}))

const stateTaxCodeLabels: Record<(typeof stateTaxCodeSchema.options)[number], string> = {
  none: 'None/Custom',
  ok: 'Oklahoma',
  tx: 'Texas',
  nj: 'New Jersey',
}

const stateTaxCodeOptions = stateTaxCodeSchema.options.map((option) => ({
  value: option,
  label: stateTaxCodeLabels[option] ?? option.toUpperCase(),
}))

const beneficiaryRelationshipLabels: Record<
  (typeof beneficiaryRelationshipSchema.options)[number],
  string
> = {
  spouse: 'Spouse',
  civil_union_partner: 'Civil union partner',
  domestic_partner: 'Domestic partner',
  child: 'Child',
  stepchild: 'Stepchild',
  grandchild: 'Grandchild',
  parent: 'Parent',
  grandparent: 'Grandparent',
  sibling: 'Sibling',
  in_law: 'In-law',
  niece_nephew: 'Niece/Nephew',
  cousin: 'Cousin',
  friend: 'Friend',
  unrelated: 'Unrelated',
  charity: 'Charity',
  religious_institution: 'Religious institution',
  educational_institution: 'Educational institution',
  government_entity: 'Government entity',
}

const beneficiaryRelationshipOptions = beneficiaryRelationshipSchema.options.map((option) => ({
  value: option,
  label: beneficiaryRelationshipLabels[option] ?? option,
}))

const addYearsToIsoDate = (isoDate: string, years: number) => {
  const date = new Date(isoDate)
  date.setFullYear(date.getFullYear() + years)
  return date.toISOString().slice(0, 10)
}

const addMonthsToIsoDate = (isoDate: string, months: number) => {
  const date = new Date(isoDate)
  date.setMonth(date.getMonth() + months)
  return date.toISOString().slice(0, 10)
}

const ageToIsoDate = (dateOfBirth: string, age: number) =>
  addMonthsToIsoDate(dateOfBirth, Math.round(age * 12))

const buildSpendingIntervals = (
  items: SpendingLineItem[],
  extraBoundaries: number[] = [],
): SpendingIntervalRow[] => {
  if (items.length === 0) {
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
  items.forEach((item) => {
    const start = parseDate(item.startDate)
    const end = parseDate(item.endDate)
    if (start !== null) {
      boundaries.add(start)
    }
    if (end !== null) {
      boundaries.add(end)
    }
  })
  extraBoundaries.forEach((boundary) => {
    if (!Number.isNaN(boundary)) {
      boundaries.add(boundary)
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
          ? items
          : items.filter((item) => {
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
        startMs: interval.start,
        endMs: interval.end,
        startLabel,
        endLabel,
        needTotal,
        wantTotal,
      }
    })
    .filter((row): row is SpendingIntervalRow => Boolean(row))
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

const editorSchema = z.object({
  scenario: scenarioSchema,
})

const isDefined = <T,>(value: T | undefined): value is T => Boolean(value)

const toIsoDateString = (value?: string | null) => {
  if (!value) {
    return null
  }
  const matches = /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (!matches) {
    return null
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return value
}

const buildSimulationSnapshot = async (
  scenario: Scenario,
  storage: StorageClient,
): Promise<SimulationSnapshot> => {
  const inflationAssumptions = buildInflationMap(
    inflationDefaultsSeed,
    scenario.strategies.returnModel.inflationAssumptions,
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
    .map((period) => normalizeFutureWorkPeriod(period))

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
  )
    .filter(isDefined)
    .map((account) => ({
      ...account,
      contributionEntries: account.contributionEntries ?? [],
    }))

  const investmentAccountHoldings = (
    await Promise.all(
      investmentAccounts.map((account) =>
        storage.investmentAccountHoldingRepo.listForAccount(account.id),
      ),
    )
  ).flat().map((holding) => ({
    ...holding,
    costBasisEntries: holding.costBasisEntries ?? [],
  }))

  const [ssaWageIndex, ssaBendPoints, ssaRetirementAdjustments] = await Promise.all([
    storage.ssaWageIndexRepo.list(),
    storage.ssaBendPointRepo.list(),
    storage.ssaRetirementAdjustmentRepo.list(),
  ])
  const contributionLimits = await storage.contributionLimitDefaultRepo.list()

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
    contributionLimits,
    taxPolicies: taxPolicySeed,
    socialSecurityProvisionalIncomeBrackets: socialSecurityProvisionalIncomeBracketsSeed,
    irmaaTables: irmaaTableSeed,
    rmdTable: rmdTableSeed,
  }
}

const buildStochasticSeeds = (
  snapshot: SimulationSnapshot,
  startDate: string,
  runCount: number,
): Array<{ runIndex: number; seed: number }> => {
  const returnModel = snapshot.scenario.strategies.returnModel
  const baseSeed =
    returnModel.seed ?? hashStringToSeed(`${snapshot.scenario.id}:${startDate}`)
  return Array.from({ length: runCount }, (_, runIndex) => ({
    runIndex,
    seed: baseSeed + runIndex + 1,
  }))
}

const chunk = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0) {
    return [items]
  }
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

const getStochasticBatchSize = (runCount: number) => {
  if (runCount <= 0) {
    return 0
  }
  const coreHint =
    typeof navigator !== 'undefined' ? Number(navigator.hardwareConcurrency) : NaN
  const targetWorkers = Number.isFinite(coreHint)
    ? Math.max(1, Math.floor(coreHint * 0.8))
    : 16
  const workerCount = Math.min(16, targetWorkers)
  const idealSize = Math.ceil(runCount / workerCount)
  return Math.min(16, Math.max(4, idealSize))
}

const normalizeSpendingLineItem = (item: SpendingLineItem): SpendingLineItem => ({
  ...item,
  inflationType: item.inflationType ?? 'cpi',
  targetInvestmentAccountHoldingId: item.targetInvestmentAccountHoldingId ?? null,
})

const normalizeFutureWorkPeriod = (base: FutureWorkPeriod): FutureWorkPeriod => {
  const contributionType = base['401kContributionType']
  const employeeHoldingId = base['401kInvestmentAccountHoldingId']
  const employerHoldingId = base['401kEmployerMatchHoldingId']
  const hsaHoldingId = base['hsaInvestmentAccountHoldingId']
  return {
    ...base,
    startDate: toIsoDateString(base.startDate),
    endDate: toIsoDateString(base.endDate),
    '401kContributionType': contributionType ? contributionType : 'fixed',
    '401kContributionAnnual': base['401kContributionAnnual'] ?? 0,
    '401kContributionPct': base['401kContributionPct'] ?? 0,
    '401kMatchPctCap': base['401kMatchPctCap'] ?? 0,
    '401kMatchRatio': base['401kMatchRatio'] ?? 0,
    '401kInvestmentAccountHoldingId': employeeHoldingId,
    '401kEmployerMatchHoldingId':
      employerHoldingId ? employerHoldingId : employeeHoldingId,
    'hsaContributionAnnual': base['hsaContributionAnnual'] ?? 0,
    'hsaEmployerContributionAnnual': base['hsaEmployerContributionAnnual'] ?? 0,
    'hsaUseMaxLimit': base['hsaUseMaxLimit'] ?? false,
    'hsaInvestmentAccountHoldingId': hsaHoldingId ? hsaHoldingId : null,
  }
}

const normalizeHolding = (holding: InvestmentAccountHolding): InvestmentAccountHolding => holding


const buildInflationMap = (
  defaults: Array<Pick<InflationDefault, 'type' | 'rate'>>,
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

const buildScenarioSeedFromSnapshot = (snapshot: SimulationSnapshot): LocalScenarioSeed => ({
  scenario: snapshot.scenario,
  people: snapshot.people,
  personStrategies: snapshot.personStrategies,
  socialSecurityStrategies: snapshot.socialSecurityStrategies,
  socialSecurityEarnings: snapshot.socialSecurityEarnings,
  futureWorkStrategies: snapshot.futureWorkStrategies,
  futureWorkPeriods: snapshot.futureWorkPeriods,
  spendingStrategies: snapshot.spendingStrategies,
  spendingLineItems: snapshot.spendingLineItems,
  nonInvestmentAccounts: snapshot.nonInvestmentAccounts,
  investmentAccounts: snapshot.investmentAccounts,
  investmentAccountHoldings: snapshot.investmentAccountHoldings,
})

const saveScenarioSeed = async (seed: LocalScenarioSeed, storage: StorageClient) => {
  await Promise.all(seed.people.map((record) => storage.personRepo.upsert(record)))
  await Promise.all(
    seed.socialSecurityEarnings.map((record) =>
      storage.socialSecurityEarningsRepo.upsert(record),
    ),
  )
  await Promise.all(
    seed.socialSecurityStrategies.map((record) =>
      storage.socialSecurityStrategyRepo.upsert(record),
    ),
  )
  await Promise.all(
    seed.futureWorkStrategies.map((record) =>
      storage.futureWorkStrategyRepo.upsert(record),
    ),
  )
  await Promise.all(
    seed.futureWorkPeriods.map((record) =>
      storage.futureWorkPeriodRepo.upsert(record),
    ),
  )
  await Promise.all(
    seed.spendingStrategies.map((record) =>
      storage.spendingStrategyRepo.upsert(record),
    ),
  )
  await Promise.all(
    seed.spendingLineItems.map((record) =>
      storage.spendingLineItemRepo.upsert(record),
    ),
  )
  await Promise.all(
    seed.nonInvestmentAccounts.map((record) =>
      storage.nonInvestmentAccountRepo.upsert(record),
    ),
  )
  await Promise.all(
    seed.investmentAccounts.map((record) =>
      storage.investmentAccountRepo.upsert(record),
    ),
  )
  await Promise.all(
    seed.investmentAccountHoldings.map((record) =>
      storage.investmentAccountHoldingRepo.upsert(record),
    ),
  )
  await Promise.all(
    seed.personStrategies.map((record) =>
      storage.personStrategyRepo.upsert(record),
    ),
  )
  await storage.scenarioRepo.upsert(seed.scenario)
}

const ScenarioDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const storage = useAppStore((state) => state.storage)
  const simClient = useAppStore((state) => state.simClient)
  const from = (location.state as { from?: string } | null)?.from
  const backTo = from && from.startsWith('/runs/') ? '/scenarios' : from ?? '/scenarios'
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
  const [futureWorkPeriods, setFutureWorkPeriods] = useState<FutureWorkPeriod[]>([])
  const [spendingStrategies, setSpendingStrategies] = useState<SpendingStrategy[]>([])
  const [spendingLineItems, setSpendingLineItems] = useState<SpendingLineItem[]>([])
  const [cashAccounts, setCashAccounts] = useState<NonInvestmentAccount[]>([])
  const [investmentAccounts, setInvestmentAccounts] = useState<InvestmentAccount[]>([])
  const [investmentBalances, setInvestmentBalances] = useState<Record<string, number>>({})
  const [inflationDefaults, setInflationDefaults] = useState<InflationDefault[]>([])
  const [selectedCashAccountId, setSelectedCashAccountId] = useState('')
  const [selectedInvestmentAccountId, setSelectedInvestmentAccountId] = useState('')
  const inflationDefaultsRef = useRef<InflationDefault[]>([])
  const handleJumpTo =
    useCallback(
      (id: string) => (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        const target = document.getElementById(id)
        if (!target) {
          return
        }
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      },
      [],
    )

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
    resolver: zodResolver(editorSchema) as Resolver<ScenarioEditorValues>,
    defaultValues,
  })

  useUnsavedChangesWarning(isDirty)

  // eslint-disable-next-line react-hooks/incompatible-library
  const selectedSpendingStrategyId = watch('scenario.spendingStrategyId')
  const inflationAssumptions = watch('scenario.strategies.returnModel.inflationAssumptions')
  const personStrategyIds = watch('scenario.personStrategyIds')
  const nonInvestmentAccountIds = watch('scenario.nonInvestmentAccountIds')
  const investmentAccountIds = watch('scenario.investmentAccountIds')
  const taxPolicyYear = watch('scenario.strategies.tax.policyYear')
  const taxFilingStatus = watch('scenario.strategies.tax.filingStatus')
  const deathEnabled = watch('scenario.strategies.death.enabled')
  const guardrailStrategy = watch('scenario.strategies.withdrawal.guardrailStrategy')
  const rothConversionStartAge = watch('scenario.strategies.rothConversion.startAge')
  const rothConversionEndAge = watch('scenario.strategies.rothConversion.endAge')
  const ladderLeadTimeYears = watch('scenario.strategies.rothLadder.leadTimeYears')
  const ladderStartAge = watch('scenario.strategies.rothLadder.startAge')
  const ladderEndAge = watch('scenario.strategies.rothLadder.endAge')
  const longTermCareLevel = watch('scenario.strategies.healthcare.longTermCareLevel')
  const longTermCareAnnualExpense = watch(
    'scenario.strategies.healthcare.longTermCareAnnualExpense',
  )
  const rothConversionBrackets = useMemo(() => {
    const policy = selectTaxPolicy(
      taxPolicySeed,
      taxPolicyYear || new Date().getFullYear(),
      taxFilingStatus,
    )
    return policy?.ordinaryBrackets ?? []
  }, [taxFilingStatus, taxPolicyYear])
  const ladderConversionStart = Math.max(0, ladderStartAge - ladderLeadTimeYears)
  const ladderConversionEnd = Math.max(0, ladderEndAge - ladderLeadTimeYears)
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
    fields: guardrailHealthPointFields,
    append: appendGuardrailHealthPoint,
    remove: removeGuardrailHealthPoint,
    replace: replaceGuardrailHealthPoints,
  } = useFieldArray({
    control,
    name: 'scenario.strategies.withdrawal.guardrailHealthPoints',
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
  const {
    fields: beneficiaryRows,
    append: appendBeneficiary,
    remove: removeBeneficiary,
    replace: replaceBeneficiaries,
  } = useFieldArray({
    control,
    name: 'scenario.strategies.death.beneficiaries',
  })

  const spendingSummaryRows = useMemo(
    () => buildSpendingIntervals(spendingLineItems),
    [spendingLineItems],
  )

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
  const futureWorkEndByStrategyId = useMemo(() => {
    const map = new Map<string, string>()
    futureWorkPeriods.forEach((period) => {
      const endDate = toIsoDateString(period.endDate)
      if (!endDate) {
        return
      }
      const current = map.get(period.futureWorkStrategyId)
      if (!current || endDate > current) {
        map.set(period.futureWorkStrategyId, endDate)
      }
    })
    return map
  }, [futureWorkPeriods])

  const scenarioPersonStrategies = useMemo(() => {
    const ids = new Set(scenario?.personStrategyIds ?? [])
    return personStrategies.filter((strategy) => ids.has(strategy.id))
  }, [personStrategies, scenario?.personStrategyIds])

  const primaryPerson = useMemo(() => {
    const primaryStrategy = scenarioPersonStrategies[0]
    return primaryStrategy ? peopleById.get(primaryStrategy.personId) : undefined
  }, [peopleById, scenarioPersonStrategies])

  const ladderSpendingRows = useMemo(() => {
    if (!scenario || spendingLineItems.length === 0) {
      return []
    }
    if (ladderStartAge <= 0 && ladderEndAge <= 0) {
      return []
    }
    if (!primaryPerson) {
      return []
    }
    const retirementEndMs = futureWorkPeriods
      .map((period) => {
        if (!period.endDate) {
          return null
        }
        const end = new Date(period.endDate)
        return Number.isNaN(end.getTime()) ? null : end.getTime()
      })
      .filter((value): value is number => value !== null)
      .reduce((latest, value) => Math.max(latest, value), Number.NEGATIVE_INFINITY)
    const hasRetirementEnd = Number.isFinite(retirementEndMs)
    const age65Ms = new Date(addYearsToIsoDate(primaryPerson.dateOfBirth, 65)).getTime()
    const preMedicareMonthly = scenario.strategies.healthcare.preMedicareMonthly
    const medicareMonthly =
      scenario.strategies.healthcare.medicarePartBMonthly +
      scenario.strategies.healthcare.medicarePartDMonthly +
      scenario.strategies.healthcare.medigapMonthly
    const extraBoundaries = [
      ...(hasRetirementEnd ? [retirementEndMs] : []),
      ...(Number.isNaN(age65Ms) ? [] : [age65Ms]),
    ]
    const intervalRows = buildSpendingIntervals(spendingLineItems, extraBoundaries)
    const startMs =
      ladderStartAge > 0
        ? new Date(addYearsToIsoDate(primaryPerson.dateOfBirth, ladderStartAge)).getTime()
        : null
    const endMs =
      ladderEndAge > 0
        ? new Date(addYearsToIsoDate(primaryPerson.dateOfBirth, ladderEndAge)).getTime()
        : null
    const rangeStart = startMs ?? Number.NEGATIVE_INFINITY
    const rangeEnd = endMs ?? Number.POSITIVE_INFINITY
    const dayMs = 24 * 60 * 60 * 1000
    const formatAgeLabel = (timestamp: number | null, offsetDays = 0) => {
      if (timestamp === null) {
        return 'Open'
      }
      const date = new Date(timestamp + offsetDays * dayMs).toISOString().slice(0, 10)
      return getAgeInYearsAtDate(primaryPerson.dateOfBirth, date).toFixed(1)
    }
    return intervalRows
      .filter((row) => {
        const intervalStart = row.startMs ?? Number.NEGATIVE_INFINITY
        const intervalEnd = row.endMs ?? Number.POSITIVE_INFINITY
        return intervalStart < rangeEnd && intervalEnd > rangeStart
      })
      .map((row) => {
        const sample =
          row.startMs !== null
            ? row.startMs
            : row.endMs !== null
              ? row.endMs - dayMs
              : null
        const annualNeed = row.needTotal * 12
        const annualWant = row.wantTotal * 12
        let monthlyHealthcare = 0
        if (hasRetirementEnd && sample !== null) {
          if (sample >= retirementEndMs && sample < age65Ms) {
            monthlyHealthcare = preMedicareMonthly
          } else if (sample >= Math.max(retirementEndMs, age65Ms)) {
            monthlyHealthcare = medicareMonthly
          }
        }
        const annualHealthcare = monthlyHealthcare * 12
        return {
          startAgeLabel: formatAgeLabel(row.startMs),
          endAgeLabel: formatAgeLabel(row.endMs, -1),
          annualNeed,
          annualWant,
          annualHealthcare,
          annualTotal: annualNeed + annualWant + annualHealthcare,
        }
      })
  }, [
    futureWorkPeriods,
    ladderEndAge,
    ladderStartAge,
    primaryPerson,
    scenario,
    spendingLineItems,
  ])

  const formatAgeDate = (age: number) => {
    if (!primaryPerson || age <= 0) {
      return '-'
    }
    return ageToIsoDate(primaryPerson.dateOfBirth, age)
  }
  const rothConversionStartDate =
    typeof rothConversionStartAge === 'number' ? formatAgeDate(rothConversionStartAge) : '-'
  const rothConversionEndDate =
    typeof rothConversionEndAge === 'number' ? formatAgeDate(rothConversionEndAge) : '-'
  const ladderStartDate =
    typeof ladderStartAge === 'number' ? formatAgeDate(ladderStartAge) : '-'
  const ladderEndDate =
    typeof ladderEndAge === 'number' ? formatAgeDate(ladderEndAge) : '-'
  const ladderConversionStartDate =
    typeof ladderConversionStart === 'number' ? formatAgeDate(ladderConversionStart) : '-'
  const ladderConversionEndDate =
    typeof ladderConversionEnd === 'number' ? formatAgeDate(ladderConversionEnd) : '-'

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

  useEffect(() => {
    if (!longTermCareLevel || longTermCareLevel === 'other') {
      return
    }
    const nextValue = longTermCareAnnualCostsByLevel[longTermCareLevel] ?? 0
    if (nextValue !== longTermCareAnnualExpense) {
      setValue('scenario.strategies.healthcare.longTermCareAnnualExpense', nextValue, {
        shouldDirty: true,
      })
    }
  }, [longTermCareAnnualExpense, longTermCareLevel, setValue])

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
      setFutureWorkPeriods([])
      setIsLoading(false)
      return
    }

    const inflationAssumptions = buildInflationMap(
      inflationDefaultsRef.current,
      data.strategies.returnModel.inflationAssumptions,
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
    replaceGuardrailHealthPoints(normalizedScenario.strategies.withdrawal.guardrailHealthPoints)
    replacePensions(normalizedScenario.strategies.pensions)
    replaceBeneficiaries(normalizedScenario.strategies.death.beneficiaries)
    setFutureWorkPeriods(futureWorkPeriods.map(normalizeFutureWorkPeriod))
    setSpendingLineItems(spendingLineItems.map(normalizeSpendingLineItem))
    setSelectionError(null)
    setIsLoading(false)
  }, [
    id,
    replaceBeneficiaries,
    replaceEvents,
    replaceGlidepathTargets,
    replaceGuardrailHealthPoints,
    replacePensions,
    reset,
    storage,
  ])

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
      '401kContributionType': 'fixed',
      '401kContributionAnnual': 0,
      '401kContributionPct': 0,
      '401kMatchPctCap': 0.05,
      '401kMatchRatio': 1,
      '401kInvestmentAccountHoldingId': holdingList[0].id,
      '401kEmployerMatchHoldingId': holdingList[0].id,
      'hsaContributionAnnual': 0,
      'hsaEmployerContributionAnnual': 0,
      'hsaUseMaxLimit': false,
      'hsaInvestmentAccountHoldingId': null,
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
    await loadReferenceData()
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
    const snapshot = await buildSimulationSnapshot(saved.scenario, storage)
    // Default to today's date until scenarios have a configurable start date.
    const startDate = new Date().toISOString().slice(0, 10)
    const input: SimulationRequest = {
      snapshot,
      startDate,
    }
    const rawStochasticRuns = saved.scenario.strategies.returnModel.stochasticRuns
    const stochasticTarget = Number.isFinite(rawStochasticRuns)
      ? Math.max(0, Math.floor(rawStochasticRuns))
      : 0
    const baseRunPromise = simClient.runScenario(input)
    const stochasticSeeds =
      stochasticTarget > 0 ? buildStochasticSeeds(snapshot, startDate, stochasticTarget) : []
    const stochasticRunsPromise =
      stochasticSeeds.length > 0
        ? Promise.all(
            chunk(stochasticSeeds, getStochasticBatchSize(stochasticSeeds.length)).map(
              async (batch) => {
                const runs = await simClient.runScenarioBatch({
                  snapshot,
                  startDate,
                  seeds: batch.map((entry) => entry.seed),
                })
                return runs.map((stochasticRun, index) => {
                  const meta = batch[index]
                  return {
                    runIndex: meta.runIndex,
                    seed: meta.seed,
                    endingBalance: stochasticRun.result.summary.endingBalance,
                    minBalance: stochasticRun.result.summary.minBalance,
                    maxBalance: stochasticRun.result.summary.maxBalance,
                    guardrailFactorAvg: stochasticRun.result.summary.guardrailFactorAvg,
                    guardrailFactorMin: stochasticRun.result.summary.guardrailFactorMin,
                    guardrailFactorBelowPct: stochasticRun.result.summary.guardrailFactorBelowPct,
                  }
                })
              },
            ),
          ).then((results) => results.flat())
        : Promise.resolve([])
    const [baseRun, stochasticRuns] = await Promise.all([
      baseRunPromise,
      stochasticRunsPromise,
    ])
    const run: SimulationRun = {
      ...baseRun,
      result: {
        ...baseRun.result,
        stochasticRuns,
      },
    }
    await storage.runRepo.add(run)
    await loadRuns(saved.scenario.id)
    navigate(`/runs/${run.id}`)
  }

  const formatRunTitle = (run: SimulationRun) =>
    run.title?.trim() ? run.title.trim() : new Date(run.finishedAt).toLocaleString()

  const formatRunEndingBalance = (run: SimulationRun) => {
    const endingBalance = run.result.summary.endingBalance
    const dateIso = run.result.timeline.at(-1)?.date
    const cpiRate = run.snapshot?.scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
    if (!dateIso || cpiRate === 0) {
      return endingBalance
    }
    const year = new Date(dateIso).getFullYear()
    const baseYear = new Date().getFullYear()
    if (Number.isNaN(year)) {
      return endingBalance
    }
    const yearDelta = year - baseYear
    return endingBalance / Math.pow(1 + cpiRate, yearDelta)
  }

  const handleRunRemove = async (runId: string) => {
    if (!window.confirm('Remove this run?')) {
      return
    }
    await storage.runRepo.remove(runId)
    setRuns((current) => current.filter((run) => run.id !== runId))
  }

  const handleRunImport = async (run: SimulationRun) => {
    if (!run.snapshot) {
      window.alert('This run does not include the scenario snapshot needed for import.')
      return
    }
    const seed = buildScenarioSeedFromSnapshot(run.snapshot)
    const remapped = remapScenarioSeed(seed)
    const now = Date.now()
    const runName = formatRunTitle(run)
    const suffix = `from ${runName}`
    const appendSuffix = (value: string) => `${value} ${suffix}`
    const scenarioName = appendSuffix(remapped.scenario.name)
    const scenario = {
      ...remapped.scenario,
      name: scenarioName,
      createdAt: now,
      updatedAt: now,
      strategies: {
        ...remapped.scenario.strategies,
        events: remapped.scenario.strategies.events.map((event) => ({
          ...event,
          name: appendSuffix(event.name),
        })),
        pensions: remapped.scenario.strategies.pensions.map((pension) => ({
          ...pension,
          name: appendSuffix(pension.name),
        })),
      },
    }
    const remappedSeed = {
      ...remapped,
      scenario,
      people: remapped.people.map((person) => ({
        ...person,
        name: appendSuffix(person.name),
      })),
      futureWorkStrategies: remapped.futureWorkStrategies.map((strategy) => ({
        ...strategy,
        name: appendSuffix(strategy.name),
      })),
      spendingStrategies: remapped.spendingStrategies.map((strategy) => ({
        ...strategy,
        name: appendSuffix(strategy.name),
      })),
      nonInvestmentAccounts: remapped.nonInvestmentAccounts.map((account) => ({
        ...account,
        name: appendSuffix(account.name),
      })),
      investmentAccounts: remapped.investmentAccounts.map((account) => ({
        ...account,
        name: appendSuffix(account.name),
      })),
      investmentAccountHoldings: remapped.investmentAccountHoldings.map((holding) => ({
        ...holding,
        name: appendSuffix(holding.name),
      })),
    }
    await saveScenarioSeed(remappedSeed, storage)
    await loadReferenceData()
    navigate(`/scenarios/${remappedSeed.scenario.id}`)
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
          <div className="button-row">
            <Link className="link" to={backTo}>
              Back
            </Link>
          </div>
        }
      />

      <div className="scenario-layout">
        <div className="stack">
          {selectionError ? (
            <div className="card">
              <p className="error">{selectionError}</p>
            </div>
          ) : null}

          <form className="stack" onSubmit={handleSubmit(onSubmit, onInvalid)}>
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

            <BasicConfigSection
              register={register}
              setValue={setValue}
              errors={errors}
              inflationAssumptions={inflationAssumptions}
              inflationByType={inflationByType}
            />

            <PeopleAssetsSection
              register={register}
              scenarioId={scenario?.id}
              locationPathname={location.pathname}
              scenarioPersonStrategies={scenarioPersonStrategies}
              peopleById={peopleById}
              socialSecurityById={socialSecurityById}
              futureWorkById={futureWorkById}
              futureWorkEndByStrategyId={futureWorkEndByStrategyId}
              onAddPersonStrategy={handleAddPersonStrategy}
              onRemovePersonStrategy={handleRemovePersonStrategy}
              availableCashAccounts={availableCashAccounts}
              selectedCashAccountId={selectedCashAccountId}
              onSelectCashAccount={setSelectedCashAccountId}
              onAddCashAccount={handleAddCashAccount}
              scenarioCashAccounts={scenarioCashAccounts}
              onRemoveCashAccount={handleRemoveCashAccount}
              availableInvestmentAccounts={availableInvestmentAccounts}
              selectedInvestmentAccountId={selectedInvestmentAccountId}
              onSelectInvestmentAccount={setSelectedInvestmentAccountId}
              onAddInvestmentAccount={handleAddInvestmentAccount}
              scenarioInvestmentAccounts={scenarioInvestmentAccounts}
              investmentBalances={investmentBalances}
              onRemoveInvestmentAccount={handleRemoveInvestmentAccount}
              appendPension={appendPension}
              removePension={removePension}
              pensionRows={pensionRows}
              stateTaxCodeOptions={stateTaxCodeOptions}
              formatCurrency={formatCurrency}
              getAgeInYearsAtDate={getAgeInYearsAtDate}
              createUuid={createUuid}
            />

            <SpendingSection
              register={register}
              selectedSpendingStrategyId={selectedSpendingStrategyId}
              spendingStrategies={spendingStrategies}
              locationPathname={location.pathname}
              onSpendingStrategySelect={handleSpendingStrategySelect}
              onAddSpendingStrategy={handleAddSpendingStrategy}
              spendingSummaryRows={spendingSummaryRows}
              formatCurrency={formatCurrency}
              longTermCareLevel={longTermCareLevel}
              guardrailStrategy={guardrailStrategy}
              guardrailHealthPointFields={guardrailHealthPointFields}
              appendGuardrailHealthPoint={appendGuardrailHealthPoint}
              removeGuardrailHealthPoint={removeGuardrailHealthPoint}
              appendEvent={appendEvent}
              removeEvent={removeEvent}
              eventRows={eventRows}
              createUuid={createUuid}
            />

            <AssetManagementSection
              register={register}
              withdrawalOrderOptions={withdrawalOrderOptions}
              glidepathTargetFields={glidepathTargetFields}
              appendGlidepathTarget={appendGlidepathTarget}
              removeGlidepathTarget={removeGlidepathTarget}
            />

            <EarlyRetirementSection
              register={register}
              rothConversionBrackets={rothConversionBrackets}
              formatCurrency={formatCurrency}
              rothConversionStartDate={rothConversionStartDate}
              rothConversionEndDate={rothConversionEndDate}
              ladderStartDate={ladderStartDate}
              ladderEndDate={ladderEndDate}
              ladderConversionStart={ladderConversionStart}
              ladderConversionEnd={ladderConversionEnd}
              ladderConversionStartDate={ladderConversionStartDate}
              ladderConversionEndDate={ladderConversionEndDate}
              ladderSpendingRows={ladderSpendingRows}
            />

            <LegacySection
              register={register}
              deathEnabled={deathEnabled}
              appendBeneficiary={appendBeneficiary}
              removeBeneficiary={removeBeneficiary}
              beneficiaryRows={beneficiaryRows}
              beneficiaryRelationshipOptions={beneficiaryRelationshipOptions}
              stateTaxCodeOptions={stateTaxCodeOptions}
              createUuid={createUuid}
            />

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

          <SimulationRunsSection
            runs={runs}
            locationPathname={location.pathname}
            formatRunTitle={formatRunTitle}
            formatRunEndingBalance={formatRunEndingBalance}
            onRunImport={handleRunImport}
            onRunRemove={handleRunRemove}
          />
        </div>

        <aside className="scenario-toc" aria-label="Jump to section">
          <div className="stack">
            <span className="muted">Jump to</span>
            <button
              className="link-button"
              type="button"
              onClick={handleJumpTo('section-basic-config')}
            >
              Basic config
            </button>
            <button
              className="link-button"
              type="button"
              onClick={handleJumpTo('section-people-assets')}
            >
              People and assets
            </button>
            <button
              className="link-button"
              type="button"
              onClick={handleJumpTo('section-spending')}
            >
              Spending
            </button>
            <button
              className="link-button"
              type="button"
              onClick={handleJumpTo('section-asset-management')}
            >
              Asset management
            </button>
            <button
              className="link-button"
              type="button"
              onClick={handleJumpTo('section-early-retirement')}
            >
              Early retirement
            </button>
            <button
              className="link-button"
              type="button"
              onClick={handleJumpTo('section-legacy')}
            >
              Legacy
            </button>
            <button
              className="link-button"
              type="button"
              onClick={handleJumpTo('section-runs')}
            >
              Simulation runs
            </button>
            <div className="button-row">
              <button
                className="button"
                type="button"
                disabled={isSubmitting || !isDirty}
                onClick={handleSubmit(onSubmit, onInvalid)}
              >
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
          </div>
        </aside>
      </div>
    </section>
  )
}

export default ScenarioDetailPage
