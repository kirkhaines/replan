import type { StorageClient } from '../storage/types'
import {
  inflationDefaultsSeed,
  holdingTypeDefaultsSeed,
  ssaBendPointSeed,
  ssaRetirementAdjustmentSeed,
  ssaWageIndexSeed,
} from './defaultData'
import { now } from '../utils/time'
import { createUuid } from '../utils/uuid'

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
}
