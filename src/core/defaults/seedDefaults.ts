import type { StorageClient } from '../storage/types'
import { inflationDefaultsSeed, ssaWageIndexSeed } from './defaultData'
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
}
