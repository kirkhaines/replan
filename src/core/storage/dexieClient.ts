import { db } from '../../db/db'
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
} from '../models'
import type {
  RunRepo,
  ScenarioRepo,
  StorageClient,
  PersonRepo,
  SocialSecurityEarningsRepo,
  SocialSecurityStrategyRepo,
  NonInvestmentAccountRepo,
  InvestmentAccountRepo,
  InvestmentAccountHoldingRepo,
  FutureWorkStrategyRepo,
  FutureWorkPeriodRepo,
  SpendingStrategyRepo,
  SpendingLineItemRepo,
  PersonStrategyRepo,
} from './types'

class DexieScenarioRepo implements ScenarioRepo {
  async list() {
    return db.scenarios.orderBy('updatedAt').reverse().toArray()
  }

  async get(id: string) {
    return db.scenarios.get(id)
  }

  async upsert(scenario: Scenario) {
    await db.scenarios.put(scenario)
  }

  async remove(id: string) {
    await db.scenarios.delete(id)
  }
}

class DexieRunRepo implements RunRepo {
  async listForScenario(scenarioId: string) {
    const runs = await db.runs
      .where('scenarioId')
      .equals(scenarioId)
      .sortBy('finishedAt')
    return runs.reverse()
  }

  async add(run: SimulationRun) {
    await db.runs.add(run)
  }

  async get(id: string) {
    return db.runs.get(id)
  }
}

class DexiePersonRepo implements PersonRepo {
  async list() {
    return db.people.orderBy('updatedAt').reverse().toArray()
  }

  async get(id: string) {
    return db.people.get(id)
  }

  async upsert(person: Person) {
    await db.people.put(person)
  }

  async remove(id: string) {
    await db.people.delete(id)
  }
}

class DexieSocialSecurityEarningsRepo implements SocialSecurityEarningsRepo {
  async listForPerson(personId: string) {
    return db.socialSecurityEarnings.where('personId').equals(personId).toArray()
  }

  async upsert(record: SocialSecurityEarnings) {
    await db.socialSecurityEarnings.put(record)
  }

  async remove(id: string) {
    await db.socialSecurityEarnings.delete(id)
  }
}

class DexieSocialSecurityStrategyRepo implements SocialSecurityStrategyRepo {
  async list() {
    return db.socialSecurityStrategies.toArray()
  }

  async get(id: string) {
    return db.socialSecurityStrategies.get(id)
  }

  async upsert(strategy: SocialSecurityStrategy) {
    await db.socialSecurityStrategies.put(strategy)
  }
}

class DexieNonInvestmentAccountRepo implements NonInvestmentAccountRepo {
  async list() {
    return db.nonInvestmentAccounts.orderBy('updatedAt').reverse().toArray()
  }

  async get(id: string) {
    return db.nonInvestmentAccounts.get(id)
  }

  async upsert(account: NonInvestmentAccount) {
    await db.nonInvestmentAccounts.put(account)
  }

  async remove(id: string) {
    await db.nonInvestmentAccounts.delete(id)
  }
}

class DexieInvestmentAccountRepo implements InvestmentAccountRepo {
  async list() {
    return db.investmentAccounts.orderBy('updatedAt').reverse().toArray()
  }

  async get(id: string) {
    return db.investmentAccounts.get(id)
  }

  async upsert(account: InvestmentAccount) {
    await db.investmentAccounts.put(account)
  }

  async remove(id: string) {
    await db.investmentAccounts.delete(id)
  }
}

class DexieInvestmentAccountHoldingRepo implements InvestmentAccountHoldingRepo {
  async listForAccount(accountId: string) {
    return db.investmentAccountHoldings
      .where('investmentAccountId')
      .equals(accountId)
      .toArray()
  }

  async list() {
    return db.investmentAccountHoldings.orderBy('updatedAt').reverse().toArray()
  }

  async get(id: string) {
    return db.investmentAccountHoldings.get(id)
  }

  async upsert(holding: InvestmentAccountHolding) {
    await db.investmentAccountHoldings.put(holding)
  }

  async remove(id: string) {
    await db.investmentAccountHoldings.delete(id)
  }
}

class DexieFutureWorkStrategyRepo implements FutureWorkStrategyRepo {
  async list() {
    return db.futureWorkStrategies.toArray()
  }

  async get(id: string) {
    return db.futureWorkStrategies.get(id)
  }

  async upsert(strategy: FutureWorkStrategy) {
    await db.futureWorkStrategies.put(strategy)
  }
}

class DexieFutureWorkPeriodRepo implements FutureWorkPeriodRepo {
  async listForStrategy(strategyId: string) {
    return db.futureWorkPeriods
      .where('futureWorkStrategyId')
      .equals(strategyId)
      .toArray()
  }

  async get(id: string) {
    return db.futureWorkPeriods.get(id)
  }

  async upsert(period: FutureWorkPeriod) {
    await db.futureWorkPeriods.put(period)
  }
}

class DexieSpendingStrategyRepo implements SpendingStrategyRepo {
  async list() {
    return db.spendingStrategies.orderBy('updatedAt').reverse().toArray()
  }

  async get(id: string) {
    return db.spendingStrategies.get(id)
  }

  async upsert(strategy: SpendingStrategy) {
    await db.spendingStrategies.put(strategy)
  }
}

class DexieSpendingLineItemRepo implements SpendingLineItemRepo {
  async listForStrategy(strategyId: string) {
    return db.spendingLineItems.where('spendingStrategyId').equals(strategyId).toArray()
  }

  async get(id: string) {
    return db.spendingLineItems.get(id)
  }

  async upsert(item: SpendingLineItem) {
    await db.spendingLineItems.put(item)
  }
}

class DexiePersonStrategyRepo implements PersonStrategyRepo {
  async list() {
    return db.personStrategies.toArray()
  }

  async listForPerson(personId: string) {
    return db.personStrategies.where('personId').equals(personId).toArray()
  }

  async get(id: string) {
    return db.personStrategies.get(id)
  }

  async upsert(strategy: PersonStrategy) {
    await db.personStrategies.put(strategy)
  }

  async remove(id: string) {
    await db.personStrategies.delete(id)
  }
}

export const createDexieStorageClient = (): StorageClient => ({
  scenarioRepo: new DexieScenarioRepo(),
  personRepo: new DexiePersonRepo(),
  socialSecurityEarningsRepo: new DexieSocialSecurityEarningsRepo(),
  socialSecurityStrategyRepo: new DexieSocialSecurityStrategyRepo(),
  nonInvestmentAccountRepo: new DexieNonInvestmentAccountRepo(),
  investmentAccountRepo: new DexieInvestmentAccountRepo(),
  investmentAccountHoldingRepo: new DexieInvestmentAccountHoldingRepo(),
  futureWorkStrategyRepo: new DexieFutureWorkStrategyRepo(),
  futureWorkPeriodRepo: new DexieFutureWorkPeriodRepo(),
  spendingStrategyRepo: new DexieSpendingStrategyRepo(),
  spendingLineItemRepo: new DexieSpendingLineItemRepo(),
  personStrategyRepo: new DexiePersonStrategyRepo(),
  runRepo: new DexieRunRepo(),
  clearAll: async () => {
    await db.transaction(
      'rw',
      db.scenarios,
      db.runs,
      db.people,
      db.socialSecurityEarnings,
      db.socialSecurityStrategies,
      db.nonInvestmentAccounts,
      db.investmentAccounts,
      db.investmentAccountHoldings,
      db.futureWorkStrategies,
      db.futureWorkPeriods,
      db.spendingStrategies,
      db.spendingLineItems,
      db.personStrategies,
      async () => {
        await Promise.all([
          db.scenarios.clear(),
          db.runs.clear(),
          db.people.clear(),
          db.socialSecurityEarnings.clear(),
          db.socialSecurityStrategies.clear(),
          db.nonInvestmentAccounts.clear(),
          db.investmentAccounts.clear(),
          db.investmentAccountHoldings.clear(),
          db.futureWorkStrategies.clear(),
          db.futureWorkPeriods.clear(),
          db.spendingStrategies.clear(),
          db.spendingLineItems.clear(),
          db.personStrategies.clear(),
        ])
      },
    )
  },
})
