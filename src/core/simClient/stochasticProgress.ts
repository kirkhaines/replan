export type StochasticProgressUpdate = {
  runId: string
  completed: number
  target: number
  cancelled: boolean
  updatedAt: number
}

type StochasticListener = (update: StochasticProgressUpdate) => void

const latestByRunId = new Map<string, StochasticProgressUpdate>()
const listeners = new Set<StochasticListener>()

export const publishStochasticProgress = (update: StochasticProgressUpdate) => {
  latestByRunId.set(update.runId, update)
  listeners.forEach((listener) => listener(update))
}

export const subscribeStochasticProgress = (
  runId: string,
  listener: StochasticListener,
) => {
  const wrapped: StochasticListener = (update) => {
    if (update.runId === runId) {
      listener(update)
    }
  }
  listeners.add(wrapped)
  const latest = latestByRunId.get(runId)
  if (latest) {
    listener(latest)
  }
  return () => {
    listeners.delete(wrapped)
  }
}

export const clearStochasticProgress = (runId?: string) => {
  if (runId) {
    latestByRunId.delete(runId)
    return
  }
  latestByRunId.clear()
}
