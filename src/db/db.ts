import Dexie, { type Table } from 'dexie'
import type {
  Scenario,
  SimulationRun,
  Person,
  SocialSecurityEarnings,
  SocialSecurityStrategy,
  NonInvestmentAccount,
  InvestmentAccount,
  InvestmentAccountHolding,
  FutureWorkStrategy,
  FutureWorkPeriod,
  SpendingStrategy,
  SpendingLineItem,
  PersonStrategy,
} from '../core/models'

class ReplanDb extends Dexie {
  scenarios!: Table<Scenario, string>
  runs!: Table<SimulationRun, string>
  people!: Table<Person, string>
  socialSecurityEarnings!: Table<SocialSecurityEarnings, string>
  socialSecurityStrategies!: Table<SocialSecurityStrategy, string>
  nonInvestmentAccounts!: Table<NonInvestmentAccount, string>
  investmentAccounts!: Table<InvestmentAccount, string>
  investmentAccountHoldings!: Table<InvestmentAccountHolding, string>
  futureWorkStrategies!: Table<FutureWorkStrategy, string>
  futureWorkPeriods!: Table<FutureWorkPeriod, string>
  spendingStrategies!: Table<SpendingStrategy, string>
  spendingLineItems!: Table<SpendingLineItem, string>
  personStrategies!: Table<PersonStrategy, string>

  constructor() {
    super('replan')
    this.version(1).stores({
      scenarios: 'id, updatedAt',
      runs: 'id, scenarioId, finishedAt',
    })
    this.version(2).stores({
      scenarios: 'id, updatedAt',
      runs: 'id, scenarioId, finishedAt',
      people: 'id, updatedAt',
      socialSecurityEarnings: 'id, personId, year',
      socialSecurityStrategies: 'id, personId',
      nonInvestmentAccounts: 'id, updatedAt',
      investmentAccounts: 'id, updatedAt',
      investmentAccountHoldings: 'id, investmentAccountId, updatedAt',
      futureWorkStrategies: 'id, personId',
      futureWorkPeriods: 'id, futureWorkStrategyId, startDate',
      spendingStrategies: 'id, updatedAt',
      spendingLineItems: 'id, spendingStrategyId, startDate',
      personStrategies: 'id, personId',
    })
  }
}

export const db = new ReplanDb()
