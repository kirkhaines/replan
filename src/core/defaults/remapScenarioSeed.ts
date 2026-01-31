import type { LocalScenarioSeed } from './localSeedTypes'
import { createUuid } from '../utils/uuid'

const remapId = (id: string, map: Map<string, string>) => {
  const existing = map.get(id)
  if (existing) {
    return existing
  }
  const next = createUuid()
  map.set(id, next)
  return next
}

export const remapScenarioSeed = (seed: LocalScenarioSeed): LocalScenarioSeed => {
  const idMap = new Map<string, string>()

  const scenarioId = remapId(seed.scenario.id, idMap)
  const people = seed.people.map((person) => ({
    ...person,
    id: remapId(person.id, idMap),
  }))
  const personStrategies = seed.personStrategies.map((strategy) => ({
    ...strategy,
    id: remapId(strategy.id, idMap),
    scenarioId,
    personId: remapId(strategy.personId, idMap),
    futureWorkStrategyId: remapId(strategy.futureWorkStrategyId, idMap),
    socialSecurityStrategyId: remapId(strategy.socialSecurityStrategyId, idMap),
  }))
  const socialSecurityStrategies = seed.socialSecurityStrategies.map((strategy) => ({
    ...strategy,
    id: remapId(strategy.id, idMap),
    personId: remapId(strategy.personId, idMap),
  }))
  const socialSecurityEarnings = seed.socialSecurityEarnings.map((earning) => ({
    ...earning,
    id: remapId(earning.id, idMap),
    personId: remapId(earning.personId, idMap),
  }))
  const futureWorkStrategies = seed.futureWorkStrategies.map((strategy) => ({
    ...strategy,
    id: remapId(strategy.id, idMap),
    personId: remapId(strategy.personId, idMap),
  }))
  const futureWorkPeriods = seed.futureWorkPeriods.map((period) => ({
    ...period,
    id: remapId(period.id, idMap),
    futureWorkStrategyId: remapId(period.futureWorkStrategyId, idMap),
    '401kInvestmentAccountHoldingId': remapId(period['401kInvestmentAccountHoldingId'], idMap),
    '401kEmployerMatchHoldingId': remapId(period['401kEmployerMatchHoldingId'], idMap),
    'hsaInvestmentAccountHoldingId': period['hsaInvestmentAccountHoldingId']
      ? remapId(period['hsaInvestmentAccountHoldingId'], idMap)
      : null,
  }))
  const spendingStrategies = seed.spendingStrategies.map((strategy) => ({
    ...strategy,
    id: remapId(strategy.id, idMap),
  }))
  const spendingLineItems = seed.spendingLineItems.map((item) => ({
    ...item,
    id: remapId(item.id, idMap),
    spendingStrategyId: remapId(item.spendingStrategyId, idMap),
    futureWorkPeriodId: item.futureWorkPeriodId
      ? remapId(item.futureWorkPeriodId, idMap)
      : undefined,
    targetInvestmentAccountHoldingId: item.targetInvestmentAccountHoldingId
      ? remapId(item.targetInvestmentAccountHoldingId, idMap)
      : null,
  }))
  const nonInvestmentAccounts = seed.nonInvestmentAccounts.map((account) => ({
    ...account,
    id: remapId(account.id, idMap),
  }))
  const investmentAccounts = seed.investmentAccounts.map((account) => ({
    ...account,
    id: remapId(account.id, idMap),
  }))
  const investmentAccountHoldings = seed.investmentAccountHoldings.map((holding) => ({
    ...holding,
    id: remapId(holding.id, idMap),
    investmentAccountId: remapId(holding.investmentAccountId, idMap),
  }))
  const scenario = {
    ...seed.scenario,
    id: scenarioId,
    personStrategyIds: seed.scenario.personStrategyIds.map((id) => remapId(id, idMap)),
    nonInvestmentAccountIds: seed.scenario.nonInvestmentAccountIds.map((id) =>
      remapId(id, idMap),
    ),
    investmentAccountIds: seed.scenario.investmentAccountIds.map((id) =>
      remapId(id, idMap),
    ),
    spendingStrategyId: remapId(seed.scenario.spendingStrategyId, idMap),
    strategies: {
      ...seed.scenario.strategies,
      events: seed.scenario.strategies.events.map((event) => ({
        ...event,
        id: remapId(event.id, idMap),
        inflationType: event.inflationType ?? 'none',
      })),
      pensions: seed.scenario.strategies.pensions.map((pension) => ({
        ...pension,
        id: remapId(pension.id, idMap),
      })),
    },
  }

  return {
    scenario,
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
  }
}
