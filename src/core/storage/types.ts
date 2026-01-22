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
  InflationDefault,
  SsaWageIndex,
  SsaBendPoint,
  SsaRetirementAdjustment,
  HoldingTypeDefault,
  ContributionLimitDefault,
} from '../models'

export interface ScenarioRepo {
  list: () => Promise<Scenario[]>
  get: (id: string) => Promise<Scenario | undefined>
  upsert: (scenario: Scenario) => Promise<void>
  remove: (id: string) => Promise<void>
}

export interface PersonRepo {
  list: () => Promise<Person[]>
  get: (id: string) => Promise<Person | undefined>
  upsert: (person: Person) => Promise<void>
  remove: (id: string) => Promise<void>
}

export interface SocialSecurityEarningsRepo {
  listForPerson: (personId: string) => Promise<SocialSecurityEarnings[]>
  upsert: (record: SocialSecurityEarnings) => Promise<void>
  remove: (id: string) => Promise<void>
}

export interface SocialSecurityStrategyRepo {
  list: () => Promise<SocialSecurityStrategy[]>
  get: (id: string) => Promise<SocialSecurityStrategy | undefined>
  upsert: (strategy: SocialSecurityStrategy) => Promise<void>
}

export interface NonInvestmentAccountRepo {
  list: () => Promise<NonInvestmentAccount[]>
  get: (id: string) => Promise<NonInvestmentAccount | undefined>
  upsert: (account: NonInvestmentAccount) => Promise<void>
  remove: (id: string) => Promise<void>
}

export interface InvestmentAccountRepo {
  list: () => Promise<InvestmentAccount[]>
  get: (id: string) => Promise<InvestmentAccount | undefined>
  upsert: (account: InvestmentAccount) => Promise<void>
  remove: (id: string) => Promise<void>
}

export interface InvestmentAccountHoldingRepo {
  listForAccount: (accountId: string) => Promise<InvestmentAccountHolding[]>
  list: () => Promise<InvestmentAccountHolding[]>
  get: (id: string) => Promise<InvestmentAccountHolding | undefined>
  upsert: (holding: InvestmentAccountHolding) => Promise<void>
  remove: (id: string) => Promise<void>
}

export interface FutureWorkStrategyRepo {
  list: () => Promise<FutureWorkStrategy[]>
  get: (id: string) => Promise<FutureWorkStrategy | undefined>
  upsert: (strategy: FutureWorkStrategy) => Promise<void>
}

export interface FutureWorkPeriodRepo {
  list: () => Promise<FutureWorkPeriod[]>
  listForStrategy: (strategyId: string) => Promise<FutureWorkPeriod[]>
  get: (id: string) => Promise<FutureWorkPeriod | undefined>
  upsert: (period: FutureWorkPeriod) => Promise<void>
  remove: (id: string) => Promise<void>
}

export interface SpendingStrategyRepo {
  list: () => Promise<SpendingStrategy[]>
  get: (id: string) => Promise<SpendingStrategy | undefined>
  upsert: (strategy: SpendingStrategy) => Promise<void>
}

export interface SpendingLineItemRepo {
  listForStrategy: (strategyId: string) => Promise<SpendingLineItem[]>
  get: (id: string) => Promise<SpendingLineItem | undefined>
  upsert: (item: SpendingLineItem) => Promise<void>
  remove: (id: string) => Promise<void>
}

export interface PersonStrategyRepo {
  list: () => Promise<PersonStrategy[]>
  listForPerson: (personId: string) => Promise<PersonStrategy[]>
  get: (id: string) => Promise<PersonStrategy | undefined>
  upsert: (strategy: PersonStrategy) => Promise<void>
  remove: (id: string) => Promise<void>
}

export interface InflationDefaultRepo {
  list: () => Promise<InflationDefault[]>
  get: (id: string) => Promise<InflationDefault | undefined>
  upsert: (record: InflationDefault) => Promise<void>
}

export interface HoldingTypeDefaultRepo {
  list: () => Promise<HoldingTypeDefault[]>
  get: (id: string) => Promise<HoldingTypeDefault | undefined>
  upsert: (record: HoldingTypeDefault) => Promise<void>
}

export interface ContributionLimitDefaultRepo {
  list: () => Promise<ContributionLimitDefault[]>
  get: (id: string) => Promise<ContributionLimitDefault | undefined>
  upsert: (record: ContributionLimitDefault) => Promise<void>
}

export interface SsaWageIndexRepo {
  list: () => Promise<SsaWageIndex[]>
  get: (id: string) => Promise<SsaWageIndex | undefined>
  upsert: (record: SsaWageIndex) => Promise<void>
  remove: (id: string) => Promise<void>
}

export interface SsaBendPointRepo {
  list: () => Promise<SsaBendPoint[]>
  get: (id: string) => Promise<SsaBendPoint | undefined>
  upsert: (record: SsaBendPoint) => Promise<void>
  remove: (id: string) => Promise<void>
}

export interface SsaRetirementAdjustmentRepo {
  list: () => Promise<SsaRetirementAdjustment[]>
  get: (id: string) => Promise<SsaRetirementAdjustment | undefined>
  upsert: (record: SsaRetirementAdjustment) => Promise<void>
  remove: (id: string) => Promise<void>
}

export interface RunRepo {
  listForScenario: (scenarioId: string) => Promise<SimulationRun[]>
  add: (run: SimulationRun) => Promise<void>
  upsert: (run: SimulationRun) => Promise<void>
  get: (id: string) => Promise<SimulationRun | undefined>
  remove: (id: string) => Promise<void>
}

export interface StorageClient {
  scenarioRepo: ScenarioRepo
  personRepo: PersonRepo
  socialSecurityEarningsRepo: SocialSecurityEarningsRepo
  socialSecurityStrategyRepo: SocialSecurityStrategyRepo
  nonInvestmentAccountRepo: NonInvestmentAccountRepo
  investmentAccountRepo: InvestmentAccountRepo
  investmentAccountHoldingRepo: InvestmentAccountHoldingRepo
  futureWorkStrategyRepo: FutureWorkStrategyRepo
  futureWorkPeriodRepo: FutureWorkPeriodRepo
  spendingStrategyRepo: SpendingStrategyRepo
  spendingLineItemRepo: SpendingLineItemRepo
  personStrategyRepo: PersonStrategyRepo
  inflationDefaultRepo: InflationDefaultRepo
  holdingTypeDefaultRepo: HoldingTypeDefaultRepo
  contributionLimitDefaultRepo: ContributionLimitDefaultRepo
  ssaWageIndexRepo: SsaWageIndexRepo
  ssaBendPointRepo: SsaBendPointRepo
  ssaRetirementAdjustmentRepo: SsaRetirementAdjustmentRepo
  runRepo: RunRepo
  clearAll: () => Promise<void>
}
