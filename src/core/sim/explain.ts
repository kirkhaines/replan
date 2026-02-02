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

export const createExplainTracker = (enabled = true): ModuleExplainTracker => {
  const inputs: ExplainMetric[] = []
  const checkpoints: ExplainMetric[] = []
  if (!enabled) {
    return {
      inputs,
      checkpoints,
      addInput: () => {},
      addCheckpoint: () => {},
      reset: () => {},
    }
  }
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
