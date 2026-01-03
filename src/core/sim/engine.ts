import type { SimulationResult } from '../models'
import type { SimulationInput } from './input'

export const runSimulation = (input: SimulationInput): SimulationResult => {
  const timeline = []
  let balance = input.startingBalance
  let spending = input.annualSpending
  let minBalance = balance
  let maxBalance = balance

  for (let yearIndex = 0; yearIndex < input.years; yearIndex += 1) {
    balance =
      balance * (1 + input.annualReturn) - spending + input.annualContribution

    const age = input.currentAge + yearIndex
    timeline.push({
      yearIndex,
      age,
      balance,
      contribution: input.annualContribution,
      spending,
    })

    if (balance < minBalance) {
      minBalance = balance
    }

    if (balance > maxBalance) {
      maxBalance = balance
    }

    spending = spending * (1 + input.annualInflation)
  }

  return {
    timeline,
    summary: {
      endingBalance: balance,
      minBalance,
      maxBalance,
    },
  }
}
