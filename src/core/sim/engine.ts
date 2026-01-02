import type { Scenario } from '../models'
import type { SimulationResult } from '../models'

export const runSimulation = (scenario: Scenario): SimulationResult => {
  const { assumptions, finances, person } = scenario
  const timeline = []
  let balance = finances.startingBalance
  let spending = finances.annualSpending
  let minBalance = balance
  let maxBalance = balance

  for (let yearIndex = 0; yearIndex < assumptions.years; yearIndex += 1) {
    balance =
      balance * (1 + assumptions.annualReturn) -
      spending +
      finances.annualContribution

    const age = person.currentAge + yearIndex
    timeline.push({
      yearIndex,
      age,
      balance,
      contribution: finances.annualContribution,
      spending,
    })

    if (balance < minBalance) {
      minBalance = balance
    }

    if (balance > maxBalance) {
      maxBalance = balance
    }

    spending = spending * (1 + assumptions.annualInflation)
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
