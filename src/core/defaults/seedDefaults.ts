import type { StorageClient } from '../storage/types'
import type { LocalScenarioSeed } from './localSeedTypes'
import {
  inflationDefaultsSeed,
  holdingTypeDefaultsSeed,
  contributionLimitDefaultsSeed,
  ssaBendPointSeed,
  ssaRetirementAdjustmentSeed,
  ssaWageIndexSeed,
} from './defaultData'
import { now } from '../utils/time'
import { createUuid } from '../utils/uuid'

const loadLocalScenarioSeed = (): LocalScenarioSeed | null => {
  const jsonModules = import.meta.glob('./localSeed.json', { eager: true })
  const jsonValues = Object.values(jsonModules) as Array<{
    default?: LocalScenarioSeed
  }>
  const jsonSeed = jsonValues[0]?.default
  if (jsonSeed) {
    return jsonSeed
  }

  const modules = import.meta.glob('./localSeed.{ts,js}', { eager: true })
  const values = Object.values(modules) as Array<{
    localScenarioSeed?: LocalScenarioSeed
  }>
  return values[0]?.localScenarioSeed ?? null
}

const seedLocalScenario = async (storage: StorageClient) => {
  const localSeed = loadLocalScenarioSeed()
  if (!localSeed) {
    return
  }
  const existing = await storage.scenarioRepo.get(localSeed.scenario.id)
  if (existing) {
    return
  }

  await Promise.all(localSeed.people.map((record) => storage.personRepo.upsert(record)))
  await Promise.all(
    localSeed.socialSecurityEarnings.map((record) =>
      storage.socialSecurityEarningsRepo.upsert(record),
    ),
  )
  await Promise.all(
    localSeed.socialSecurityStrategies.map((record) =>
      storage.socialSecurityStrategyRepo.upsert(record),
    ),
  )
  await Promise.all(
    localSeed.futureWorkStrategies.map((record) =>
      storage.futureWorkStrategyRepo.upsert(record),
    ),
  )
  await Promise.all(
    localSeed.futureWorkPeriods.map((record) =>
      storage.futureWorkPeriodRepo.upsert(record),
    ),
  )
  await Promise.all(
    localSeed.spendingStrategies.map((record) =>
      storage.spendingStrategyRepo.upsert(record),
    ),
  )
  await Promise.all(
    localSeed.spendingLineItems.map((record) =>
      storage.spendingLineItemRepo.upsert(record),
    ),
  )
  await Promise.all(
    localSeed.nonInvestmentAccounts.map((record) =>
      storage.nonInvestmentAccountRepo.upsert(record),
    ),
  )
  await Promise.all(
    localSeed.investmentAccounts.map((record) =>
      storage.investmentAccountRepo.upsert(record),
    ),
  )
  await Promise.all(
    localSeed.investmentAccountHoldings.map((record) =>
      storage.investmentAccountHoldingRepo.upsert(record),
    ),
  )
  await Promise.all(
    localSeed.personStrategies.map((record) =>
      storage.personStrategyRepo.upsert(record),
    ),
  )
  await storage.scenarioRepo.upsert(localSeed.scenario)
}

export const seedDefaults = async (storage: StorageClient) => {
  const timestamp = now()

  const existingInflation = await storage.inflationDefaultRepo.list()
  const inflationByType = new Map(existingInflation.map((item) => [item.type, item]))
  const inflationSeeds = inflationDefaultsSeed.filter(
    (seed) => !inflationByType.has(seed.type),
  )
  if (inflationSeeds.length > 0) {
    await Promise.all(
      inflationSeeds.map((seed) =>
        storage.inflationDefaultRepo.upsert({
          id: seed.type,
          type: seed.type,
          rate: seed.rate,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ),
    )
  }

  const existingWageIndex = await storage.ssaWageIndexRepo.list()
  if (existingWageIndex.length === 0) {
    await Promise.all(
      ssaWageIndexSeed.map((seed) =>
        storage.ssaWageIndexRepo.upsert({
          id: createUuid(),
          year: seed.year,
          index: seed.index,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ),
    )
  }

  const existingHoldingTypes = await storage.holdingTypeDefaultRepo.list()
  if (existingHoldingTypes.length === 0) {
    await Promise.all(
      holdingTypeDefaultsSeed.map((seed) =>
        storage.holdingTypeDefaultRepo.upsert({
          id: seed.type,
          type: seed.type,
          returnRate: seed.returnRate,
          returnStdDev: seed.returnStdDev,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ),
    )
  }

  const existingContributionLimits = await storage.contributionLimitDefaultRepo.list()
  if (existingContributionLimits.length === 0) {
    await Promise.all(
      contributionLimitDefaultsSeed.map((seed) =>
        storage.contributionLimitDefaultRepo.upsert({
          id: createUuid(),
          type: seed.type,
          year: seed.year,
          amount: seed.amount,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ),
    )
  }

  const existingBendPoints = await storage.ssaBendPointRepo.list()
  if (existingBendPoints.length === 0) {
    await Promise.all(
      ssaBendPointSeed.map((seed) =>
        storage.ssaBendPointRepo.upsert({
          id: createUuid(),
          year: seed.year,
          first: seed.first,
          second: seed.second,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ),
    )
  }

  const existingRetirementAdjustments = await storage.ssaRetirementAdjustmentRepo.list()
  if (existingRetirementAdjustments.length === 0) {
    await Promise.all(
      ssaRetirementAdjustmentSeed.map((seed) =>
        storage.ssaRetirementAdjustmentRepo.upsert({
          id: createUuid(),
          birthYearStart: seed.birthYearStart,
          birthYearEnd: seed.birthYearEnd,
          normalRetirementAgeMonths: seed.normalRetirementAgeMonths,
          delayedRetirementCreditPerYear: seed.delayedRetirementCreditPerYear,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ),
    )
  }

  await seedLocalScenario(storage)
}
