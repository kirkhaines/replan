import type { SimulationSnapshot } from '../models'
import type { SimulationModule, SimulationSettings } from './types'

const toMonthlyRate = (annualRate: number) => Math.pow(1 + annualRate, 1 / 12) - 1

const createFundingModule = (): SimulationModule => ({
  id: 'funding-core',
  getActionIntents: (state) => {
    const cashBalance = state.cashAccounts.reduce((sum, account) => sum + account.balance, 0)
    if (cashBalance >= 0) {
      return []
    }
    return [
      {
        id: 'funding-cash-deficit',
        kind: 'withdraw',
        amount: Math.abs(cashBalance),
        priority: 0,
        label: 'Cover cash deficit',
      },
    ]
  },
})

const createReturnModule = (): SimulationModule => ({
  id: 'returns-core',
  onEndOfMonth: (state) => {
    state.cashAccounts.forEach((account) => {
      const rate = toMonthlyRate(account.interestRate)
      account.balance *= 1 + rate
    })
    state.holdings.forEach((holding) => {
      const rate = toMonthlyRate(holding.returnRate)
      holding.balance *= 1 + rate
    })
  },
})

export const createSimulationModules = (
  snapshot: SimulationSnapshot,
  settings: SimulationSettings,
): SimulationModule[] => {
  void snapshot
  void settings
  return [createFundingModule(), createReturnModule()]
}
