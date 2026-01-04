import { z } from 'zod'
import { scenarioSchema } from './scenario'
import { personSchema } from './person'
import { personStrategySchema } from './strategies'
import {
  socialSecurityEarningsSchema,
  socialSecurityStrategySchema,
} from './socialSecurity'
import { futureWorkPeriodSchema, futureWorkStrategySchema } from './futureWork'
import { spendingLineItemSchema, spendingStrategySchema } from './spending'
import {
  investmentAccountHoldingSchema,
  investmentAccountSchema,
  nonInvestmentAccountSchema,
} from './accounts'
import {
  ssaBendPointSchema,
  ssaRetirementAdjustmentSchema,
  ssaWageIndexSchema,
} from './defaults'

export const simulationSnapshotSchema = z.object({
  scenario: scenarioSchema,
  people: z.array(personSchema),
  personStrategies: z.array(personStrategySchema),
  socialSecurityStrategies: z.array(socialSecurityStrategySchema),
  socialSecurityEarnings: z.array(socialSecurityEarningsSchema),
  futureWorkStrategies: z.array(futureWorkStrategySchema),
  futureWorkPeriods: z.array(futureWorkPeriodSchema),
  spendingStrategies: z.array(spendingStrategySchema),
  spendingLineItems: z.array(spendingLineItemSchema),
  nonInvestmentAccounts: z.array(nonInvestmentAccountSchema),
  investmentAccounts: z.array(investmentAccountSchema),
  investmentAccountHoldings: z.array(investmentAccountHoldingSchema),
  ssaWageIndex: z.array(ssaWageIndexSchema),
  ssaBendPoints: z.array(ssaBendPointSchema),
  ssaRetirementAdjustments: z.array(ssaRetirementAdjustmentSchema),
})

export type SimulationSnapshot = z.infer<typeof simulationSnapshotSchema>
