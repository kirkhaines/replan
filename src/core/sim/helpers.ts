import type { SimulationContext } from './types'

export const getSimulationYearIndex = (context: SimulationContext) =>
  Math.floor(context.monthIndex / 12)
