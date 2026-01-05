import type {
  Scenario,
  Person,
  PersonStrategy,
  SocialSecurityStrategy,
  SocialSecurityEarnings,
  FutureWorkStrategy,
  FutureWorkPeriod,
  SpendingStrategy,
  SpendingLineItem,
  NonInvestmentAccount,
  InvestmentAccount,
  InvestmentAccountHolding,
} from '../models'

export type LocalScenarioSeed = {
  scenario: Scenario
  people: Person[]
  personStrategies: PersonStrategy[]
  socialSecurityStrategies: SocialSecurityStrategy[]
  socialSecurityEarnings: SocialSecurityEarnings[]
  futureWorkStrategies: FutureWorkStrategy[]
  futureWorkPeriods: FutureWorkPeriod[]
  spendingStrategies: SpendingStrategy[]
  spendingLineItems: SpendingLineItem[]
  nonInvestmentAccounts: NonInvestmentAccount[]
  investmentAccounts: InvestmentAccount[]
  investmentAccountHoldings: InvestmentAccountHolding[]
}
