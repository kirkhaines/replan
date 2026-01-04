import { z } from 'zod'
import { simulationSnapshotSchema, type SimulationSnapshot } from '../models'

export const simulationInputSchema = z.object({
  scenarioId: z.string().uuid(),
  currentAge: z.number().min(0),
  years: z.number().min(1),
  startingBalance: z.number(),
  annualContribution: z.number(),
  annualSpending: z.number(),
  annualReturn: z.number(),
  annualInflation: z.number(),
})

export type SimulationInput = z.infer<typeof simulationInputSchema>

export const simulationRequestSchema = z.object({
  snapshot: simulationSnapshotSchema,
})

export type SimulationRequest = z.infer<typeof simulationRequestSchema>

const ageFromDob = (dateOfBirth: string) => {
  const dob = new Date(dateOfBirth)
  const now = new Date()
  const diff = now.getTime() - dob.getTime()
  const years = diff / (365.25 * 24 * 60 * 60 * 1000)
  return Math.max(0, Math.floor(years))
}

const compareNumber = (left: number, right: number) => left - right

export const buildSimulationInputFromSnapshot = (
  snapshot: SimulationSnapshot,
): SimulationInput | null => {
  const scenario = snapshot.scenario
  const primaryPersonStrategyId = scenario.personStrategyIds[0]
  const personStrategy = snapshot.personStrategies.find(
    (strategy) => strategy.id === primaryPersonStrategyId,
  )
  const person =
    (personStrategy
      ? snapshot.people.find((entry) => entry.id === personStrategy.personId)
      : null) ?? snapshot.people[0]
  if (!person) {
    return null
  }

  const spendingStrategy = snapshot.spendingStrategies.find(
    (strategy) => strategy.id === scenario.spendingStrategyId,
  )
  if (!spendingStrategy) {
    return null
  }

  const spendingLineItems = snapshot.spendingLineItems.filter(
    (item) => item.spendingStrategyId === spendingStrategy.id,
  )

  const cashAccounts = snapshot.nonInvestmentAccounts.filter((account) =>
    scenario.nonInvestmentAccountIds.includes(account.id),
  )
  const investmentAccounts = snapshot.investmentAccounts.filter((account) =>
    scenario.investmentAccountIds.includes(account.id),
  )
  if (cashAccounts.length === 0 || investmentAccounts.length === 0) {
    return null
  }

  const holdings = snapshot.investmentAccountHoldings
    .filter((holding) => investmentAccounts.some((account) => account.id === holding.investmentAccountId))
    .sort((a, b) => compareNumber(a.createdAt, b.createdAt))
  const holding = holdings[0]
  if (!holding) {
    return null
  }

  const currentAge = ageFromDob(person.dateOfBirth)
  const years = Math.max(1, Math.round(person.lifeExpectancy - currentAge))
  const startingBalance =
    cashAccounts.reduce((sum, account) => sum + account.balance, 0) +
    holdings.reduce((sum, accountHolding) => sum + accountHolding.balance, 0)
  const annualReturn = holding.balance > 0 ? holding.returnRate : 0
  const annualSpending =
    spendingLineItems.reduce((sum, item) => sum + item.needAmount, 0) * 12
  const annualContribution = 0

  return {
    scenarioId: scenario.id,
    currentAge,
    years,
    startingBalance,
    annualContribution,
    annualSpending,
    annualReturn,
    annualInflation: scenario.inflationAssumptions.cpi ?? 0,
  }
}
