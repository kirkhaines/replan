import type {
  Scenario,
  Person,
  SocialSecurityStrategy,
  FutureWorkStrategy,
  FutureWorkPeriod,
  SpendingStrategy,
  SpendingLineItem,
  NonInvestmentAccount,
  InvestmentAccount,
  InvestmentAccountHolding,
  PersonStrategy,
} from '../../core/models'
import { createUuid } from '../../core/utils/uuid'

export type ScenarioBundle = {
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

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10)

export const createDefaultScenarioBundle = (): ScenarioBundle => {
  const now = Date.now()
  const today = new Date()
  const tenYears = new Date()
  tenYears.setFullYear(today.getFullYear() + 10)
  const thirtyYears = new Date()
  thirtyYears.setFullYear(today.getFullYear() + 30)

  const personId = createUuid()
  const socialSecurityStrategyId = createUuid()
  const futureWorkStrategyId = createUuid()
  const futureWorkPeriodId = createUuid()
  const spendingStrategyId = createUuid()
  const spendingLineItemId = createUuid()
  const nonInvestmentAccountId = createUuid()
  const investmentAccountId = createUuid()
  const investmentAccountHoldingId = createUuid()
  const personStrategyId = createUuid()

  const person: Person = {
    id: personId,
    name: 'Primary',
    dateOfBirth: '1985-01-01',
    lifeExpectancy: 90,
    createdAt: now,
    updatedAt: now,
  }

  const socialSecurityStrategy: SocialSecurityStrategy = {
    id: socialSecurityStrategyId,
    personId,
    startAge: 67,
    createdAt: now,
    updatedAt: now,
  }

  const futureWorkStrategy: FutureWorkStrategy = {
    id: futureWorkStrategyId,
    name: 'Primary work',
    personId,
    createdAt: now,
    updatedAt: now,
  }

  const futureWorkPeriod: FutureWorkPeriod = {
    id: futureWorkPeriodId,
    name: 'Current job',
    futureWorkStrategyId,
    salary: 90000,
    bonus: 5000,
    startDate: toIsoDate(today),
    endDate: toIsoDate(tenYears),
    '401kMatchPctCap': 0.05,
    '401kMatchRatio': 1,
    '401kInvestmentAccountHoldingId': investmentAccountHoldingId,
    includesHealthInsurance: true,
    createdAt: now,
    updatedAt: now,
  }

  const spendingStrategy: SpendingStrategy = {
    id: spendingStrategyId,
    name: 'Base spending',
    createdAt: now,
    updatedAt: now,
  }

  const spendingLineItem: SpendingLineItem = {
    id: spendingLineItemId,
    name: 'Living',
    spendingStrategyId,
    category: 'Living',
    needAmount: 3000,
    wantAmount: 1000,
    startDate: toIsoDate(today),
    endDate: toIsoDate(thirtyYears),
    isPreTax: false,
    isCharitable: false,
    isWork: false,
    targetInvestmentAccountHoldingId: investmentAccountHoldingId,
    inflationType: 'cpi',
    createdAt: now,
    updatedAt: now,
  }

  const nonInvestmentAccount: NonInvestmentAccount = {
    id: nonInvestmentAccountId,
    name: 'Cash',
    balance: 20000,
    interestRate: 0.01,
    createdAt: now,
    updatedAt: now,
  }

  const investmentAccount: InvestmentAccount = {
    id: investmentAccountId,
    name: 'Brokerage',
    createdAt: now,
    updatedAt: now,
  }

  const investmentAccountHolding: InvestmentAccountHolding = {
    id: investmentAccountHoldingId,
    name: 'S&P 500',
    taxType: 'taxable',
    balance: 150000,
    holdingType: 'sp500',
    return: 0.05,
    risk: 0.15,
    investmentAccountId,
    createdAt: now,
    updatedAt: now,
  }

  const personStrategy: PersonStrategy = {
    id: personStrategyId,
    personId,
    futureWorkStrategyId,
    socialSecurityStrategyId,
    createdAt: now,
    updatedAt: now,
  }

  const scenario: Scenario = {
    id: createUuid(),
    name: 'New Scenario',
    createdAt: now,
    updatedAt: now,
    personStrategyIds: [personStrategyId],
    nonInvestmentAccountIds: [nonInvestmentAccountId],
    investmentAccountIds: [investmentAccountId],
    spendingStrategyId,
    fundingStrategyType: 'pro_rata',
  }

  return {
    scenario,
    person,
    socialSecurityStrategy,
    futureWorkStrategy,
    futureWorkPeriod,
    spendingStrategy,
    spendingLineItem,
    nonInvestmentAccount,
    investmentAccount,
    investmentAccountHolding,
    personStrategy,
  }
}
