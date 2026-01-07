import type { SimulationSnapshot } from '../models'
import type { SimulationModule, SimulationSettings } from './types'
import { createCashBufferModule } from './modules/cashBufferModule'
import { createCharitableModule } from './modules/charitableModule'
import { createConversionModule } from './modules/conversionModule'
import { createEventModule } from './modules/eventModule'
import { createFundingModule } from './modules/fundingModule'
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
    createSpendingModule(snapshot),
    createEventModule(snapshot),
    createPensionModule(snapshot),
    createHealthcareModule(snapshot, settings),
    createCharitableModule(snapshot),
    createWorkModule(snapshot),
    createSocialSecurityModule(snapshot),
    createCashBufferModule(snapshot),
    createRebalancingModule(snapshot),
    createConversionModule(snapshot),
    createRmdModule(snapshot),
    createTaxModule(snapshot),
    createFundingModule(snapshot),
    createReturnModule(snapshot, settings),
  ]
}
