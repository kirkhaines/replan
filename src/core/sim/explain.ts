import type { ExplainMetric } from '../models'

export type ModuleExplainTracker = {
  inputs: ExplainMetric[]
  checkpoints: ExplainMetric[]
  addInput: (label: string, value: ExplainMetric['value']) => void
  addCheckpoint: (label: string, value: ExplainMetric['value']) => void
  reset: () => void
}

const toMetric = (label: string, value: ExplainMetric['value']): ExplainMetric => ({
  label,
  value,
})

export const createExplainTracker = (): ModuleExplainTracker => {
  const inputs: ExplainMetric[] = []
  const checkpoints: ExplainMetric[] = []
  return {
    inputs,
    checkpoints,
    addInput: (label, value) => {
      inputs.push(toMetric(label, value))
    },
    addCheckpoint: (label, value) => {
      checkpoints.push(toMetric(label, value))
    },
    reset: () => {
      inputs.length = 0
      checkpoints.length = 0
    },
  }
}
