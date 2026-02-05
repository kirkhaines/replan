import Dexie, { type Table } from 'dexie'
import type {
  Scenario,
  SimulationRun,
  SimulationRunSummary,
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
  HoldingTypeDefault,
  ContributionLimitDefault,
  SsaWageIndex,
  SsaBendPoint,
  SsaRetirementAdjustment,
} from '../core/models'
import { applyInflation } from '../core/utils/inflation'

class ReplanDb extends Dexie {
  scenarios!: Table<Scenario, string>
  runs!: Table<SimulationRun, string>
  runSummaries!: Table<SimulationRunSummary, string>
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
  inflationDefaults!: Table<InflationDefault, string>
  holdingTypeDefaults!: Table<HoldingTypeDefault, string>
  contributionLimitDefaults!: Table<ContributionLimitDefault, string>
  ssaWageIndex!: Table<SsaWageIndex, string>
  ssaBendPoints!: Table<SsaBendPoint, string>
  ssaRetirementAdjustments!: Table<SsaRetirementAdjustment, string>

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
    this.version(3).stores({
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
      inflationDefaults: 'id, type',
      ssaWageIndex: 'id, year',
    })
    this.version(4).stores({
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
      inflationDefaults: 'id, type',
      ssaWageIndex: 'id, year',
      ssaBendPoints: 'id, year',
    })
    this.version(5).stores({
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
      personStrategies: 'id, personId, scenarioId',
      inflationDefaults: 'id, type',
      ssaWageIndex: 'id, year',
      ssaBendPoints: 'id, year',
    })
    this.version(6).stores({
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
      personStrategies: 'id, personId, scenarioId',
      inflationDefaults: 'id, type',
      ssaWageIndex: 'id, year',
      ssaBendPoints: 'id, year',
      ssaRetirementAdjustments: 'id, birthYearStart, birthYearEnd',
    })
    this.version(7).stores({
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
      personStrategies: 'id, personId, scenarioId',
      inflationDefaults: 'id, type',
      holdingTypeDefaults: 'id, type',
      ssaWageIndex: 'id, year',
      ssaBendPoints: 'id, year',
      ssaRetirementAdjustments: 'id, birthYearStart, birthYearEnd',
    })
    this.version(8).stores({
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
      personStrategies: 'id, personId, scenarioId',
      inflationDefaults: 'id, type',
      holdingTypeDefaults: 'id, type',
      contributionLimitDefaults: 'id, type, year',
      ssaWageIndex: 'id, year',
      ssaBendPoints: 'id, year',
      ssaRetirementAdjustments: 'id, birthYearStart, birthYearEnd',
    })
    this.version(9)
      .stores({
        scenarios: 'id, updatedAt',
        runs: 'id, scenarioId, finishedAt',
        runSummaries: 'id, scenarioId, finishedAt',
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
        personStrategies: 'id, personId, scenarioId',
        inflationDefaults: 'id, type',
        holdingTypeDefaults: 'id, type',
        contributionLimitDefaults: 'id, type, year',
        ssaWageIndex: 'id, year',
        ssaBendPoints: 'id, year',
        ssaRetirementAdjustments: 'id, birthYearStart, birthYearEnd',
      })
      .upgrade(async (tx) => {
        const runs = await tx.table<SimulationRun, string>('runs').toArray()
        const summaries = runs.map<SimulationRunSummary>((run) => {
          const endingBalance = run.result.summary.endingBalance
          const dateIso = run.result.timeline.at(-1)?.date
          const inflationAssumptions =
            run.snapshot?.scenario.strategies.returnModel.inflationAssumptions
          let endingBalanceToday = endingBalance
          if (dateIso && inflationAssumptions) {
            endingBalanceToday = applyInflation({
              amount: endingBalance,
              inflationType: 'cpi',
              fromDateIso: dateIso,
              toDateIso: new Date().toISOString().slice(0, 10),
              assumptions: inflationAssumptions,
            })
          }
          const stochasticRuns = run.result.stochasticRuns ?? []
          const stochasticSuccessPct =
            stochasticRuns.length === 0
              ? null
              : (stochasticRuns.filter((entry) => entry.endingBalance >= 0).length /
                  stochasticRuns.length) *
                100
          return {
            id: run.id,
            scenarioId: run.scenarioId,
            title: run.title,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            status: run.status,
            errorMessage: run.errorMessage,
            resultSummary: run.result.summary,
            endingBalanceToday,
            stochasticSuccessPct,
          }
        })
        await tx.table<SimulationRunSummary, string>('runSummaries').bulkPut(summaries)
      })
  }
}

export const db = new ReplanDb()
