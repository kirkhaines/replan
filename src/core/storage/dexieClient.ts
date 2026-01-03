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
  async get(id: string) {
    return db.socialSecurityStrategies.get(id)
  }

  async upsert(strategy: SocialSecurityStrategy) {
    await db.socialSecurityStrategies.put(strategy)
  }
}

class DexieNonInvestmentAccountRepo implements NonInvestmentAccountRepo {
  async get(id: string) {
    return db.nonInvestmentAccounts.get(id)
  }

  async upsert(account: NonInvestmentAccount) {
    await db.nonInvestmentAccounts.put(account)
  }
}

class DexieInvestmentAccountRepo implements InvestmentAccountRepo {
  async get(id: string) {
    return db.investmentAccounts.get(id)
  }

  async upsert(account: InvestmentAccount) {
    await db.investmentAccounts.put(account)
  }
}

class DexieInvestmentAccountHoldingRepo implements InvestmentAccountHoldingRepo {
  async listForAccount(accountId: string) {
    return db.investmentAccountHoldings
      .where('investmentAccountId')
      .equals(accountId)
      .toArray()
  }

  async get(id: string) {
    return db.investmentAccountHoldings.get(id)
  }

  async upsert(holding: InvestmentAccountHolding) {
    await db.investmentAccountHoldings.put(holding)
  }
}

class DexieFutureWorkStrategyRepo implements FutureWorkStrategyRepo {
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
  async get(id: string) {
    return db.personStrategies.get(id)
  }

  async upsert(strategy: PersonStrategy) {
    await db.personStrategies.put(strategy)
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
})
