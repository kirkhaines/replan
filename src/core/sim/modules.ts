import type { SimulationSnapshot } from '../models'
import type { SimulationModule, SimulationSettings } from './types'
import { createCashBufferModule } from './modules/cashBufferModule'
import { createCharitableModule } from './modules/charitableModule'
import { createConversionModule } from './modules/conversionModule'
import { createDeathModule } from './modules/deathModule'
import { createEventModule } from './modules/eventModule'
import { createHealthcareModule } from './modules/healthcareModule'
import { createPensionModule } from './modules/pensionModule'
import { createRebalancingModule } from './modules/rebalancingModule'
import { createRmdModule } from './modules/rmdModule'
import { createReturnModule } from './modules/returnModule'
import { createSocialSecurityModule } from './modules/socialSecurityModule'
import { createSpendingModule } from './modules/spendingModule'
import { createTaxModule } from './modules/taxModule'
import { createWorkModule } from './modules/workModule'

export const createSimulationModules = (
  snapshot: SimulationSnapshot,
  settings: SimulationSettings,
): SimulationModule[] => {
  return [
    createSpendingModule(snapshot, settings),
    createEventModule(snapshot, settings),
    createPensionModule(snapshot, settings),
    createHealthcareModule(snapshot, settings),
    createCharitableModule(snapshot, settings),
    createWorkModule(snapshot, settings),
    createSocialSecurityModule(snapshot, settings),
    createCashBufferModule(snapshot, settings),
    createRebalancingModule(snapshot, settings),
    createConversionModule(snapshot, settings),
    createRmdModule(snapshot, settings),
    createTaxModule(snapshot, settings),
    createDeathModule(snapshot, settings),
    createReturnModule(snapshot, settings),
  ]
}
