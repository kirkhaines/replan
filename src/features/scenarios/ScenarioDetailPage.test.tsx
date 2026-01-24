import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HashRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import ScenarioDetailPage from './ScenarioDetailPage'
import type { StorageClient } from '../../core/storage/types'
import type { ISimClient } from '../../core/simClient/types'
import { buildScenario } from '../../test/scenarioFactory'
import type {
  FutureWorkPeriod,
  FutureWorkStrategy,
  InvestmentAccount,
  InvestmentAccountHolding,
  NonInvestmentAccount,
  Person,
  PersonStrategy,
  Scenario,
  SocialSecurityStrategy,
  SpendingLineItem,
  SpendingStrategy,
} from '../../core/models'

let uuidCounter = 0
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

vi.mock('../../core/utils/uuid', () => ({
  createUuid: () => {
    uuidCounter += 1
    return `00000000-0000-4000-8000-00000000${uuidCounter.toString().padStart(4, '0')}`
  },
}))

type SeedData = {
  scenarios: Scenario[]
  people: Person[]
  personStrategies: PersonStrategy[]
  socialSecurityStrategies: SocialSecurityStrategy[]
  futureWorkStrategies: FutureWorkStrategy[]
  futureWorkPeriods: FutureWorkPeriod[]
  spendingStrategies: SpendingStrategy[]
  spendingLineItems: SpendingLineItem[]
  nonInvestmentAccounts: NonInvestmentAccount[]
  investmentAccounts: InvestmentAccount[]
  investmentAccountHoldings: InvestmentAccountHolding[]
}

const cloneScenario = (scenario: Scenario): Scenario => ({
  ...scenario,
  personStrategyIds: [...scenario.personStrategyIds],
  nonInvestmentAccountIds: [...scenario.nonInvestmentAccountIds],
  investmentAccountIds: [...scenario.investmentAccountIds],
})

const createStorageFixture = (seed: SeedData): StorageClient => {
  const data = {
    scenarios: seed.scenarios.map(cloneScenario),
    people: seed.people.map((item) => ({ ...item })),
    personStrategies: seed.personStrategies.map((item) => ({ ...item })),
    socialSecurityStrategies: seed.socialSecurityStrategies.map((item) => ({ ...item })),
    futureWorkStrategies: seed.futureWorkStrategies.map((item) => ({ ...item })),
    futureWorkPeriods: seed.futureWorkPeriods.map((item) => ({ ...item })),
    spendingStrategies: seed.spendingStrategies.map((item) => ({ ...item })),
    spendingLineItems: seed.spendingLineItems.map((item) => ({ ...item })),
    nonInvestmentAccounts: seed.nonInvestmentAccounts.map((item) => ({ ...item })),
    investmentAccounts: seed.investmentAccounts.map((item) => ({ ...item })),
    investmentAccountHoldings: seed.investmentAccountHoldings.map((item) => ({ ...item })),
  }

  const upsert = <T extends { id: string }>(list: T[], item: T) => {
    const index = list.findIndex((entry) => entry.id === item.id)
    if (index === -1) {
      list.push(item)
    } else {
      list[index] = item
    }
  }

  const remove = <T extends { id: string }>(list: T[], id: string) => {
    const index = list.findIndex((entry) => entry.id === id)
    if (index !== -1) {
      list.splice(index, 1)
    }
  }

  return {
    scenarioRepo: {
      list: vi.fn(async () => [...data.scenarios]),
      get: vi.fn(async (id) => data.scenarios.find((scenario) => scenario.id === id)),
      upsert: vi.fn(async (scenario) => upsert(data.scenarios, scenario)),
      remove: vi.fn(async (id) => remove(data.scenarios, id)),
    },
    personRepo: {
      list: vi.fn(async () => [...data.people]),
      get: vi.fn(async (id) => data.people.find((person) => person.id === id)),
      upsert: vi.fn(async (person) => upsert(data.people, person)),
      remove: vi.fn(async (id) => remove(data.people, id)),
    },
    socialSecurityEarningsRepo: {
      listForPerson: vi.fn(async () => []),
      upsert: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    },
    socialSecurityStrategyRepo: {
      list: vi.fn(async () => [...data.socialSecurityStrategies]),
      get: vi.fn(async (id) =>
        data.socialSecurityStrategies.find((strategy) => strategy.id === id),
      ),
      upsert: vi.fn(async (strategy) => upsert(data.socialSecurityStrategies, strategy)),
    },
    nonInvestmentAccountRepo: {
      list: vi.fn(async () => [...data.nonInvestmentAccounts]),
      get: vi.fn(async (id) => data.nonInvestmentAccounts.find((account) => account.id === id)),
      upsert: vi.fn(async (account) => upsert(data.nonInvestmentAccounts, account)),
      remove: vi.fn(async (id) => remove(data.nonInvestmentAccounts, id)),
    },
    investmentAccountRepo: {
      list: vi.fn(async () => [...data.investmentAccounts]),
      get: vi.fn(async (id) => data.investmentAccounts.find((account) => account.id === id)),
      upsert: vi.fn(async (account) => upsert(data.investmentAccounts, account)),
      remove: vi.fn(async (id) => remove(data.investmentAccounts, id)),
    },
    investmentAccountHoldingRepo: {
      list: vi.fn(async () => [...data.investmentAccountHoldings]),
      listForAccount: vi.fn(async (accountId) =>
        data.investmentAccountHoldings.filter(
          (holding) => holding.investmentAccountId === accountId,
        ),
      ),
      get: vi.fn(async (id) => data.investmentAccountHoldings.find((holding) => holding.id === id)),
      upsert: vi.fn(async (holding) => upsert(data.investmentAccountHoldings, holding)),
      remove: vi.fn(async (id) => remove(data.investmentAccountHoldings, id)),
    },
    futureWorkStrategyRepo: {
      list: vi.fn(async () => [...data.futureWorkStrategies]),
      get: vi.fn(async (id) => data.futureWorkStrategies.find((strategy) => strategy.id === id)),
      upsert: vi.fn(async (strategy) => upsert(data.futureWorkStrategies, strategy)),
    },
    futureWorkPeriodRepo: {
      list: vi.fn(async () => [...data.futureWorkPeriods]),
      listForStrategy: vi.fn(async (strategyId) =>
        data.futureWorkPeriods.filter((period) => period.futureWorkStrategyId === strategyId),
      ),
      get: vi.fn(async (id) => data.futureWorkPeriods.find((period) => period.id === id)),
      upsert: vi.fn(async (period) => upsert(data.futureWorkPeriods, period)),
      remove: vi.fn(async (id) => remove(data.futureWorkPeriods, id)),
    },
    spendingStrategyRepo: {
      list: vi.fn(async () => [...data.spendingStrategies]),
      get: vi.fn(async (id) => data.spendingStrategies.find((strategy) => strategy.id === id)),
      upsert: vi.fn(async (strategy) => upsert(data.spendingStrategies, strategy)),
    },
    spendingLineItemRepo: {
      listForStrategy: vi.fn(async (strategyId) =>
        data.spendingLineItems.filter((item) => item.spendingStrategyId === strategyId),
      ),
      get: vi.fn(async (id) => data.spendingLineItems.find((item) => item.id === id)),
      upsert: vi.fn(async (item) => upsert(data.spendingLineItems, item)),
      remove: vi.fn(async (id) => remove(data.spendingLineItems, id)),
    },
    personStrategyRepo: {
      list: vi.fn(async () => [...data.personStrategies]),
      listForPerson: vi.fn(async (personId) =>
        data.personStrategies.filter((strategy) => strategy.personId === personId),
      ),
      get: vi.fn(async (id) => data.personStrategies.find((strategy) => strategy.id === id)),
      upsert: vi.fn(async (strategy) => upsert(data.personStrategies, strategy)),
      remove: vi.fn(async (id) => remove(data.personStrategies, id)),
    },
    inflationDefaultRepo: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
    },
    holdingTypeDefaultRepo: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
    },
    contributionLimitDefaultRepo: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
    },
    ssaWageIndexRepo: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    },
    ssaBendPointRepo: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    },
    ssaRetirementAdjustmentRepo: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    },
    runRepo: {
      listForScenario: vi.fn(async () => []),
      add: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
      get: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    },
    clearAll: vi.fn(async () => undefined),
  }
}

const buildSeed = (options?: { includeSecondary?: boolean }) => {
  const now = Date.now()
  const person: Person = {
    id: '00000000-0000-4000-8000-000000000101',
    name: 'Alex Planner',
    dateOfBirth: '1982-02-02',
    lifeExpectancy: 90,
    createdAt: now,
    updatedAt: now,
  }
  const personTwo: Person = {
    id: '00000000-0000-4000-8000-000000000201',
    name: 'Taylor Planner',
    dateOfBirth: '1980-02-02',
    lifeExpectancy: 88,
    createdAt: now,
    updatedAt: now,
  }
  const socialSecurityStrategy: SocialSecurityStrategy = {
    id: '00000000-0000-4000-8000-000000000102',
    personId: person.id,
    startDate: '2049-02-02',
    createdAt: now,
    updatedAt: now,
  }
  const socialSecurityStrategyTwo: SocialSecurityStrategy = {
    id: '00000000-0000-4000-8000-000000000202',
    personId: personTwo.id,
    startDate: '2046-02-02',
    createdAt: now,
    updatedAt: now,
  }
  const futureWorkStrategy: FutureWorkStrategy = {
    id: '00000000-0000-4000-8000-000000000103',
    personId: person.id,
    name: 'Primary work',
    createdAt: now,
    updatedAt: now,
  }
  const futureWorkStrategyTwo: FutureWorkStrategy = {
    id: '00000000-0000-4000-8000-000000000203',
    personId: personTwo.id,
    name: 'Secondary work',
    createdAt: now,
    updatedAt: now,
  }
  const futureWorkPeriod: FutureWorkPeriod = {
    id: '00000000-0000-4000-8000-000000000104',
    name: 'Main role',
    futureWorkStrategyId: futureWorkStrategy.id,
    salary: 100000,
    bonus: 5000,
    startDate: '2020-01-01',
    endDate: '2030-01-01',
    '401kContributionType': 'fixed',
    '401kContributionAnnual': 0,
    '401kContributionPct': 0,
    '401kMatchPctCap': 0.05,
    '401kMatchRatio': 1,
    '401kInvestmentAccountHoldingId': '00000000-0000-4000-8000-000000000110',
    '401kEmployerMatchHoldingId': '00000000-0000-4000-8000-000000000110',
    'hsaContributionAnnual': 0,
    'hsaEmployerContributionAnnual': 0,
    'hsaUseMaxLimit': false,
    'hsaInvestmentAccountHoldingId': null,
    includesHealthInsurance: true,
    createdAt: now,
    updatedAt: now,
  }
  const futureWorkPeriodTwo: FutureWorkPeriod = {
    id: '00000000-0000-4000-8000-000000000204',
    name: 'Side role',
    futureWorkStrategyId: futureWorkStrategyTwo.id,
    salary: 90000,
    bonus: 3000,
    startDate: '2020-01-01',
    endDate: '2030-01-01',
    '401kContributionType': 'fixed',
    '401kContributionAnnual': 0,
    '401kContributionPct': 0,
    '401kMatchPctCap': 0.04,
    '401kMatchRatio': 1,
    '401kInvestmentAccountHoldingId': '00000000-0000-4000-8000-000000000210',
    '401kEmployerMatchHoldingId': '00000000-0000-4000-8000-000000000210',
    'hsaContributionAnnual': 0,
    'hsaEmployerContributionAnnual': 0,
    'hsaUseMaxLimit': false,
    'hsaInvestmentAccountHoldingId': null,
    includesHealthInsurance: true,
    createdAt: now,
    updatedAt: now,
  }
  const spendingStrategy: SpendingStrategy = {
    id: '00000000-0000-4000-8000-000000000106',
    name: 'Baseline spending',
    createdAt: now,
    updatedAt: now,
  }
  const spendingStrategyTwo: SpendingStrategy = {
    id: '00000000-0000-4000-8000-000000000206',
    name: 'Lean spending',
    createdAt: now,
    updatedAt: now,
  }
  const spendingLineItem: SpendingLineItem = {
    id: '00000000-0000-4000-8000-000000000107',
    spendingStrategyId: spendingStrategy.id,
    category: 'Housing',
    name: 'Mortgage',
    needAmount: 1500,
    wantAmount: 200,
    startDate: '2020-01-01',
    endDate: '2030-01-01',
    isPreTax: false,
    isCharitable: false,
    isWork: false,
    targetInvestmentAccountHoldingId: '00000000-0000-4000-8000-000000000110',
    inflationType: 'cpi',
    createdAt: now,
    updatedAt: now,
  }
  const spendingLineItemTwo: SpendingLineItem = {
    id: '00000000-0000-4000-8000-000000000207',
    spendingStrategyId: spendingStrategyTwo.id,
    category: 'Housing',
    name: 'Rent',
    needAmount: 1000,
    wantAmount: 150,
    startDate: '2020-01-01',
    endDate: '2030-01-01',
    isPreTax: false,
    isCharitable: false,
    isWork: false,
    targetInvestmentAccountHoldingId: '00000000-0000-4000-8000-000000000110',
    inflationType: 'cpi',
    createdAt: now,
    updatedAt: now,
  }
  const nonInvestmentAccount: NonInvestmentAccount = {
    id: '00000000-0000-4000-8000-000000000108',
    name: 'Savings',
    balance: 12000,
    interestRate: 0.02,
    createdAt: now,
    updatedAt: now,
  }
  const nonInvestmentAccountTwo: NonInvestmentAccount = {
    id: '00000000-0000-4000-8000-000000000208',
    name: 'Checking',
    balance: 4000,
    interestRate: 0.01,
    createdAt: now,
    updatedAt: now,
  }
  const investmentAccount: InvestmentAccount = {
    id: '00000000-0000-4000-8000-000000000109',
    name: 'Brokerage',
    contributionEntries: [],
    createdAt: now,
    updatedAt: now,
  }
  const investmentAccountTwo: InvestmentAccount = {
    id: '00000000-0000-4000-8000-000000000209',
    name: 'IRA',
    contributionEntries: [],
    createdAt: now,
    updatedAt: now,
  }
  const investmentAccountHolding: InvestmentAccountHolding = {
    id: '00000000-0000-4000-8000-000000000110',
    name: 'S&P 500',
    taxType: 'taxable',
    balance: 60000,
    costBasisEntries: [{ date: '2020-01-01', amount: 60000 }],
    holdingType: 'sp500',
    returnRate: 0.05,
    returnStdDev: 0.15,
    investmentAccountId: investmentAccount.id,
    createdAt: now,
    updatedAt: now,
  }
  const investmentAccountHoldingTwo: InvestmentAccountHolding = {
    id: '00000000-0000-4000-8000-000000000210',
    name: 'Bonds',
    taxType: 'traditional',
    balance: 25000,
    costBasisEntries: [{ date: '2020-01-01', amount: 25000 }],
    holdingType: 'bonds',
    returnRate: 0.03,
    returnStdDev: 0.1,
    investmentAccountId: investmentAccountTwo.id,
    createdAt: now,
    updatedAt: now,
  }
  const personStrategy: PersonStrategy = {
    id: '00000000-0000-4000-8000-000000000105',
    scenarioId: '00000000-0000-4000-8000-000000009999',
    personId: person.id,
    futureWorkStrategyId: futureWorkStrategy.id,
    socialSecurityStrategyId: socialSecurityStrategy.id,
    createdAt: now,
    updatedAt: now,
  }
  const personStrategyTwo: PersonStrategy = {
    id: '00000000-0000-4000-8000-000000000205',
    scenarioId: '00000000-0000-4000-8000-000000009999',
    personId: personTwo.id,
    futureWorkStrategyId: futureWorkStrategyTwo.id,
    socialSecurityStrategyId: socialSecurityStrategyTwo.id,
    createdAt: now,
    updatedAt: now,
  }
  const scenario = buildScenario({
    id: '00000000-0000-4000-8000-000000009999',
    name: 'Starter plan',
    personStrategyIds: options?.includeSecondary
      ? [personStrategy.id, personStrategyTwo.id]
      : [personStrategy.id],
    nonInvestmentAccountIds: options?.includeSecondary
      ? [nonInvestmentAccount.id, nonInvestmentAccountTwo.id]
      : [nonInvestmentAccount.id],
    investmentAccountIds: options?.includeSecondary
      ? [investmentAccount.id, investmentAccountTwo.id]
      : [investmentAccount.id],
    spendingStrategyId: spendingStrategy.id,
  })

  return {
    seed: {
      scenarios: [cloneScenario(scenario)],
      people: options?.includeSecondary ? [person, personTwo] : [person],
      personStrategies: options?.includeSecondary ? [personStrategy, personStrategyTwo] : [personStrategy],
      socialSecurityStrategies: options?.includeSecondary
        ? [socialSecurityStrategy, socialSecurityStrategyTwo]
        : [socialSecurityStrategy],
      futureWorkStrategies: options?.includeSecondary
        ? [futureWorkStrategy, futureWorkStrategyTwo]
        : [futureWorkStrategy],
      futureWorkPeriods: options?.includeSecondary
        ? [futureWorkPeriod, futureWorkPeriodTwo]
        : [futureWorkPeriod],
      spendingStrategies: [spendingStrategy, spendingStrategyTwo],
      spendingLineItems: [spendingLineItem, spendingLineItemTwo],
      nonInvestmentAccounts: options?.includeSecondary
        ? [nonInvestmentAccount, nonInvestmentAccountTwo]
        : [nonInvestmentAccount],
      investmentAccounts: options?.includeSecondary
        ? [investmentAccount, investmentAccountTwo]
        : [investmentAccount],
      investmentAccountHoldings: options?.includeSecondary
        ? [investmentAccountHolding, investmentAccountHoldingTwo]
        : [investmentAccountHolding],
    },
    scenario: cloneScenario(scenario),
    spendingStrategy,
    spendingStrategyTwo,
  }
}

const mockStore: { storage: StorageClient; simClient: ISimClient } = {
  storage: createStorageFixture(
    buildSeed().seed,
  ),
  simClient: { runScenario: vi.fn() } as ISimClient,
}

vi.mock('../../state/appStore', () => ({
  useAppStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}))

const renderScenario = (scenarioId: string) => {
  render(
    <MemoryRouter initialEntries={[`/scenarios/${scenarioId}`]}>
      <Routes>
        <Route path="/scenarios/:id" element={<ScenarioDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const renderScenarioWithNav = (scenarioId: string) => {
  window.location.hash = `#/scenarios/${scenarioId}`
  render(
    <HashRouter>
      <Routes>
        <Route path="/scenarios/:id" element={<ScenarioDetailPage />} />
        <Route path="/scenarios" element={<div>Scenario List</div>} />
      </Routes>
    </HashRouter>,
  )
}

const formatLogValue = (value: unknown) => {
  if (value instanceof Error) {
    return value.stack ?? value.message
  }
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const collectSaveDiagnostics = (
  storage: StorageClient,
  warnSpy: ReturnType<typeof vi.spyOn>,
  errorSpy: ReturnType<typeof vi.spyOn>,
  infoSpy: ReturnType<typeof vi.spyOn>,
) => {
  const saveButton = screen.queryByRole('button', { name: /save scenario/i })
  const saveDisabled = saveButton ? saveButton.hasAttribute('disabled') : null
  const scenarioNameInput = screen.queryByLabelText('Scenario name') as
    | HTMLInputElement
    | null
  const strategySelect = screen.queryByLabelText('Strategy') as HTMLSelectElement | null
  const invalidFields = Array.from(document.querySelectorAll('[aria-invalid="true"]')).map(
    (element) =>
      element.getAttribute('name') ||
      element.getAttribute('id') ||
      element.getAttribute('data-testid') ||
      element.tagName,
  )
  const errorMessages = Array.from(document.querySelectorAll('.error'))
    .map((element) => element.textContent?.trim())
    .filter((value): value is string => Boolean(value))
  const warnCall = warnSpy.mock.calls.find(
    ([message]) =>
      typeof message === 'string' &&
      message.includes('[Scenario] Save blocked by validation errors.'),
  )
  const errorCall = errorSpy.mock.calls.find(
    ([message]) => typeof message === 'string' && message.includes('[Scenario] Save failed.'),
  )
  const saveRequestedCall = infoSpy.mock.calls.find(
    ([message]) => typeof message === 'string' && message.includes('[Scenario] Save requested.'),
  )
  const saveCompleteCall = infoSpy.mock.calls.find(
    ([message]) => typeof message === 'string' && message.includes('[Scenario] Save complete.'),
  )
  const upsertCalls = (storage.scenarioRepo.upsert as ReturnType<typeof vi.fn>).mock.calls.length
  return {
    saveDisabled,
    scenarioName: scenarioNameInput?.value ?? null,
    spendingStrategyId: strategySelect?.value ?? null,
    invalidFields,
    errorMessages,
    warnCall,
    errorCall,
    saveRequestedCall,
    saveCompleteCall,
    upsertCalls,
  }
}

const expectScenarioSave = async (storage: StorageClient, trigger?: () => void) => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  let submitCount = 0
  const saveButton = screen.queryByRole('button', { name: /save scenario/i })
  const form =
    (saveButton?.closest('form') as HTMLFormElement | null) ??
    (document.querySelector('form') as HTMLFormElement | null)
  const handleSubmit = () => {
    submitCount += 1
  }
  form?.addEventListener('submit', handleSubmit)
  try {
    trigger?.()
    await waitFor(() => {
      const diagnostics = collectSaveDiagnostics(storage, warnSpy, errorSpy, infoSpy)
      if (diagnostics.warnCall) {
        throw new Error(
          `[Scenario] Save blocked by validation errors:\n${formatLogValue(
            diagnostics.warnCall[1],
          )}`,
        )
      }
      if (diagnostics.errorCall) {
        throw new Error(`[Scenario] Save failed:\n${formatLogValue(diagnostics.errorCall[1])}`)
      }
      if (diagnostics.upsertCalls > 0) {
        return
      }
      if (diagnostics.saveDisabled) {
        throw new Error('[Scenario] Save did not run because the save button is disabled.')
      }
      throw new Error('[Scenario] Save did not run yet.')
    })
  } catch (error) {
    const diagnostics = collectSaveDiagnostics(storage, warnSpy, errorSpy, infoSpy)
    const details: string[] = []
    if (diagnostics.warnCall) {
      details.push(
        `[Scenario] Save blocked by validation errors:\n${formatLogValue(
          diagnostics.warnCall[1],
        )}`,
      )
    }
    if (diagnostics.errorCall) {
      details.push(`[Scenario] Save failed:\n${formatLogValue(diagnostics.errorCall[1])}`)
    }
    details.push(`Save requested log: ${Boolean(diagnostics.saveRequestedCall)}`)
    details.push(`Save complete log: ${Boolean(diagnostics.saveCompleteCall)}`)
    if (diagnostics.saveRequestedCall) {
      details.push(
        `[Scenario] Save requested:\n${formatLogValue(diagnostics.saveRequestedCall[1])}`,
      )
    }
    if (diagnostics.saveCompleteCall) {
      details.push(
        `[Scenario] Save complete:\n${formatLogValue(diagnostics.saveCompleteCall[1])}`,
      )
    }
    if (diagnostics.scenarioName !== null) {
      details.push(`Scenario name value: ${diagnostics.scenarioName}`)
    }
    if (diagnostics.spendingStrategyId !== null) {
      details.push(`Spending strategy value: ${diagnostics.spendingStrategyId}`)
    }
    if (diagnostics.saveDisabled !== null) {
      details.push(`Save button disabled: ${diagnostics.saveDisabled}`)
    }
    if (diagnostics.invalidFields.length > 0) {
      details.push(`Invalid fields: ${diagnostics.invalidFields.join(', ')}`)
    }
    if (diagnostics.errorMessages.length > 0) {
      details.push(`Error messages: ${diagnostics.errorMessages.join(' | ')}`)
    }
    details.push(`Scenario upsert calls: ${diagnostics.upsertCalls}`)
    details.push(`Form submit events: ${submitCount}`)
    throw new Error(
      `Scenario save did not complete.\n${details.join('\n')}\nCause: ${formatLogValue(error)}`,
    )
  } finally {
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    infoSpy.mockRestore()
    form?.removeEventListener('submit', handleSubmit)
  }
}

beforeEach(() => {
  uuidCounter = 0
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

test('renders scenario detail with linked data', async () => {
  const { seed, scenario } = buildSeed()
  mockStore.storage = createStorageFixture(seed)

  renderScenario(scenario.id)

  expect(await screen.findByText('Edit scenario')).toBeTruthy()
  expect(screen.getByText('Alex Planner')).toBeTruthy()
  expect(screen.getByText('Savings')).toBeTruthy()
  expect(screen.getByText('Brokerage')).toBeTruthy()
  expect(screen.getByText('Baseline spending')).toBeTruthy()
})

test('shows not found state when scenario is missing', async () => {
  const { seed } = buildSeed()
  const storage = createStorageFixture(seed)
  storage.scenarioRepo.get = vi.fn(async () => undefined)
  mockStore.storage = storage

  renderScenario('00000000-0000-4000-8000-000000009000')

  expect(await screen.findByText('Scenario not found')).toBeTruthy()
})

test('saving persists name and spending strategy changes', async () => {
  const { seed, scenario, spendingStrategyTwo } = buildSeed()
  const storage = createStorageFixture(seed)
  mockStore.storage = storage

  renderScenario(scenario.id)

  await screen.findByText('Edit scenario')

  const nameInput = screen.getByLabelText('Scenario name')
  fireEvent.change(nameInput, { target: { value: 'Updated plan' } })

  const spendingSelect = screen.getByLabelText('Strategy')
  fireEvent.change(spendingSelect, { target: { value: spendingStrategyTwo.id } })

  const saveButton = screen.getByRole('button', { name: /save scenario/i })
  const form = saveButton.closest('form')
  if (!form) {
    throw new Error('Missing scenario form')
  }
  // Clicking the submit button isn't firing submit in this test environment; submit directly.
  await expectScenarioSave(storage, () => fireEvent.submit(form))

  const lastCall =
    (storage.scenarioRepo.upsert as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
  expect(lastCall?.name).toBe('Updated plan')
  expect(lastCall?.spendingStrategyId).toBe(spendingStrategyTwo.id)
})

test('saving persists strategy scalars, events, and pensions', async () => {
  const { seed, scenario } = buildSeed()
  const storage = createStorageFixture(seed)
  mockStore.storage = storage

  renderScenario(scenario.id)

  await screen.findByText('Edit scenario')

  fireEvent.change(screen.getByLabelText('Volatility scale'), { target: { value: '0.75' } })

  fireEvent.click(screen.getByRole('button', { name: /add event/i }))
  const eventsHeading = screen.getByRole('heading', { name: 'Events' })
  const eventsSection = eventsHeading.parentElement?.parentElement
  if (!eventsSection) {
    throw new Error('Missing events section')
  }
  const eventsTable = within(eventsSection).getByRole('table')
  const eventRow = within(eventsTable).getAllByRole('row')[1]
  const eventNameInput = eventRow.querySelector('input:not([type])')
  const eventDateInput = eventRow.querySelector('input[type="date"]')
  const eventAmountInput = eventRow.querySelector('input[type="number"]')
  const eventTaxSelect = eventRow.querySelector('select')
  if (!eventNameInput || !eventDateInput || !eventAmountInput || !eventTaxSelect) {
    throw new Error('Missing event row inputs')
  }
  fireEvent.change(eventNameInput, { target: { value: 'Windfall' } })
  fireEvent.change(eventDateInput, { target: { value: '2032-05-01' } })
  fireEvent.change(eventAmountInput, { target: { value: '5000' } })
  fireEvent.change(eventTaxSelect, { target: { value: 'ordinary' } })

  fireEvent.click(screen.getByRole('button', { name: /add pension/i }))
  const pensionsHeading = screen.getByRole('heading', { name: 'Pensions' })
  const pensionsSection = pensionsHeading.parentElement?.parentElement
  if (!pensionsSection) {
    throw new Error('Missing pensions section')
  }
  const pensionsTable = within(pensionsSection).getByRole('table')
  const pensionRow = within(pensionsTable).getAllByRole('row')[1]
  const pensionNameInput = pensionRow.querySelector('input:not([type])')
  const pensionDateInputs = pensionRow.querySelectorAll('input[type="date"]')
  const pensionAmountInput = pensionRow.querySelector('input[type="number"]')
  const pensionSelects = pensionRow.querySelectorAll('select')
  if (
    !pensionNameInput ||
    pensionDateInputs.length < 2 ||
    !pensionAmountInput ||
    pensionSelects.length < 2
  ) {
    throw new Error('Missing pension row inputs')
  }
  fireEvent.change(pensionNameInput, { target: { value: 'Company pension' } })
  fireEvent.change(pensionDateInputs[0], { target: { value: '2030-01-01' } })
  fireEvent.change(pensionDateInputs[1], { target: { value: '2050-01-01' } })
  fireEvent.change(pensionAmountInput, { target: { value: '1800' } })
  fireEvent.change(pensionSelects[0], { target: { value: 'medical' } })
  fireEvent.change(pensionSelects[1], { target: { value: 'tax_exempt' } })

  const saveButton = screen.getByRole('button', { name: /save scenario/i })
  const form = saveButton.closest('form')
  if (!form) {
    throw new Error('Missing scenario form')
  }
  // Clicking the submit button isn't firing submit in this test environment; submit directly.
  await expectScenarioSave(storage, () => fireEvent.submit(form))

  const lastCall =
    (storage.scenarioRepo.upsert as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
  expect(lastCall?.strategies.returnModel.volatilityScale).toBe(0.75)
  expect(lastCall?.strategies.events).toHaveLength(1)
  expect(lastCall?.strategies.events[0]?.name).toBe('Windfall')
  expect(lastCall?.strategies.events[0]?.amount).toBe(5000)
  expect(lastCall?.strategies.events[0]?.taxTreatment).toBe('ordinary')
  expect(lastCall?.strategies.pensions).toHaveLength(1)
  expect(lastCall?.strategies.pensions[0]?.name).toBe('Company pension')
  expect(lastCall?.strategies.pensions[0]?.monthlyAmount).toBe(1800)
  expect(lastCall?.strategies.pensions[0]?.inflationType).toBe('medical')
  expect(lastCall?.strategies.pensions[0]?.taxTreatment).toBe('tax_exempt')
})

test('prompts before navigating away with unsaved changes', async () => {
  const { seed, scenario } = buildSeed()
  const storage = createStorageFixture(seed)
  mockStore.storage = storage
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

  renderScenarioWithNav(scenario.id)

  await screen.findByText('Edit scenario')
  await screen.findByDisplayValue(scenario.name)

  fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: 'Dirty plan' } })
  await screen.findByDisplayValue('Dirty plan')
  fireEvent.click(screen.getByText('Back'))

  await waitFor(() => {
    expect(confirmSpy).toHaveBeenCalled()
  })
  expect(screen.getByText('Edit scenario')).toBeTruthy()
  expect(screen.queryByText('Scenario List')).toBeNull()
  confirmSpy.mockRestore()
})

test('allows navigation when confirming unsaved changes', async () => {
  const { seed, scenario } = buildSeed()
  const storage = createStorageFixture(seed)
  mockStore.storage = storage
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

  renderScenarioWithNav(scenario.id)

  await screen.findByText('Edit scenario')
  await screen.findByDisplayValue(scenario.name)

  fireEvent.change(screen.getByLabelText('Scenario name'), { target: { value: 'Dirty plan' } })
  await screen.findByDisplayValue('Dirty plan')
  fireEvent.click(screen.getByText('Back'))

  await waitFor(() => {
    expect(confirmSpy).toHaveBeenCalled()
  })
  expect(await screen.findByText('Scenario List')).toBeTruthy()
  confirmSpy.mockRestore()
})

test('saving persists added person strategy, cash account, and investment account', async () => {
  const { seed, scenario } = buildSeed()
  const now = Date.now()
  const extraCash: NonInvestmentAccount = {
    id: '00000000-0000-4000-8000-000000000308',
    name: 'Extra cash',
    balance: 2500,
    interestRate: 0.015,
    createdAt: now,
    updatedAt: now,
  }
  const extraInvestment: InvestmentAccount = {
    id: '00000000-0000-4000-8000-000000000309',
    name: 'Extra IRA',
    contributionEntries: [],
    createdAt: now,
    updatedAt: now,
  }
  const extraHolding: InvestmentAccountHolding = {
    id: '00000000-0000-4000-8000-000000000310',
    name: 'Extra bonds',
    taxType: 'traditional',
    balance: 15000,
    costBasisEntries: [{ date: '2020-01-01', amount: 15000 }],
    holdingType: 'bonds',
    returnRate: 0.03,
    returnStdDev: 0.1,
    investmentAccountId: extraInvestment.id,
    createdAt: now,
    updatedAt: now,
  }
  seed.nonInvestmentAccounts.push(extraCash)
  seed.investmentAccounts.push(extraInvestment)
  seed.investmentAccountHoldings.push(extraHolding)
  const storage = createStorageFixture(seed)
  mockStore.storage = storage

  expect(scenario.personStrategyIds.length).toBe(1)
  expect(scenario.nonInvestmentAccountIds.length).toBe(1)
  expect(scenario.investmentAccountIds.length).toBe(1)

  renderScenario(scenario.id)

  await screen.findByText('Edit scenario')

  fireEvent.click(screen.getByRole('button', { name: /add person/i }))
  await waitFor(() => {
    expect(storage.personStrategyRepo.upsert).toHaveBeenCalled()
  })
  fireEvent.change(screen.getByLabelText('Add cash account'), {
    target: { value: extraCash.id },
  })
  fireEvent.click(screen.getByRole('button', { name: /add cash account/i }))
  await waitFor(() => {
    expect(screen.getByText('Extra cash')).toBeTruthy()
  })
  fireEvent.change(screen.getByLabelText('Add investment account'), {
    target: { value: extraInvestment.id },
  })
  fireEvent.click(screen.getByRole('button', { name: /add investment account/i }))
  await waitFor(() => {
    expect(screen.getByText('Extra IRA')).toBeTruthy()
  })

  const personStrategies = await storage.personStrategyRepo.list()
  const cashAccounts = await storage.nonInvestmentAccountRepo.list()
  const investmentAccounts = await storage.investmentAccountRepo.list()
  expect(personStrategies.length).toBe(2)
  expect(cashAccounts.length).toBe(2)
  expect(investmentAccounts.length).toBe(2)

  const saveButton = screen.getByRole('button', { name: /save scenario/i })
  const form = saveButton.closest('form')
  if (!form) {
    throw new Error('Missing scenario form')
  }
  // Clicking the submit button isn't firing submit in this test environment; submit directly.
  await expectScenarioSave(storage, () => fireEvent.submit(form))

  const lastCall =
    (storage.scenarioRepo.upsert as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
  expect(lastCall?.personStrategyIds.length).toBe(2)
  expect(lastCall?.nonInvestmentAccountIds.length).toBe(2)
  expect(lastCall?.investmentAccountIds.length).toBe(2)
  expect(lastCall?.personStrategyIds).toEqual(
    expect.arrayContaining([personStrategies[0]?.id, personStrategies[1]?.id]),
  )
  expect(lastCall?.nonInvestmentAccountIds).toEqual(
    expect.arrayContaining([cashAccounts[0]?.id, cashAccounts[1]?.id]),
  )
  expect(lastCall?.investmentAccountIds).toEqual(
    expect.arrayContaining([investmentAccounts[0]?.id, investmentAccounts[1]?.id]),
  )
})

test('saving persists removed person strategy, cash account, and investment account', async () => {
  const { seed, scenario } = buildSeed({ includeSecondary: true })
  const storage = createStorageFixture(seed)
  mockStore.storage = storage
  vi.spyOn(window, 'confirm').mockReturnValue(true)

  expect(scenario.personStrategyIds.length).toBe(2)
  expect(scenario.nonInvestmentAccountIds.length).toBe(2)
  expect(scenario.investmentAccountIds.length).toBe(2)

  renderScenario(scenario.id)

  await screen.findByText('Edit scenario')

  const personRow = screen.getByText('Taylor Planner').closest('tr')
  if (!personRow) {
    throw new Error('Missing person strategy row')
  }
  fireEvent.click(within(personRow).getByRole('button', { name: /remove/i }))
  await waitFor(() => {
    expect(screen.queryByText('Taylor Planner')).toBeNull()
  })

  const cashRow = screen.getByText('Checking').closest('tr')
  if (!cashRow) {
    throw new Error('Missing cash account row')
  }
  fireEvent.click(within(cashRow).getByRole('button', { name: /remove/i }))
  await waitFor(() => {
    expect(screen.queryByText('Checking')).toBeNull()
  })

  const investmentRow = screen.getByText('IRA').closest('tr')
  if (!investmentRow) {
    throw new Error('Missing investment account row')
  }
  fireEvent.click(within(investmentRow).getByRole('button', { name: /remove/i }))
  await waitFor(() => {
    expect(screen.queryByText('IRA')).toBeNull()
  })

  const saveButton = screen.getByRole('button', { name: /save scenario/i })
  const form = saveButton.closest('form')
  if (!form) {
    throw new Error('Missing scenario form')
  }
  // Clicking the submit button isn't firing submit in this test environment; submit directly.
  await expectScenarioSave(storage, () => fireEvent.submit(form))

  const lastCall =
    (storage.scenarioRepo.upsert as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
  expect(lastCall?.personStrategyIds.length).toBe(1)
  expect(lastCall?.nonInvestmentAccountIds.length).toBe(1)
  expect(lastCall?.investmentAccountIds.length).toBe(1)
})
