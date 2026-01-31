import type {
  ISimClient,
  RunScenarioBatchInput,
  RunScenarioBatchResponse,
  RunScenarioResponse,
} from './types'
import type { SimulationRun } from '../models'
import type { SimulationRequest } from '../sim/input'
import { createUuid } from '../utils/uuid'

export const createWorkerSimClient = (): ISimClient => {
  const defaultWorkers = 16
  const coreHint =
    typeof navigator !== 'undefined' ? Number(navigator.hardwareConcurrency) : NaN
  const workerCount = Number.isFinite(coreHint)
    ? Math.max(1, Math.floor(coreHint * 0.8))
    : defaultWorkers

  const workers = Array.from({ length: workerCount }, () => ({
    worker: new Worker(new URL('../../workers/simulationWorker.ts', import.meta.url), {
      type: 'module',
    }),
    busy: false,
  }))
  type PendingEntry =
    | { workerIndex: number; resolve: (run: SimulationRun) => void; kind: 'single' }
    | { workerIndex: number; resolve: (runs: SimulationRun[]) => void; kind: 'batch' }
  const pending = new Map<string, PendingEntry>()
  const queue: Array<
    | {
        requestId: string
        input: SimulationRequest
        resolve: (run: SimulationRun) => void
        kind: 'single'
      }
    | {
        requestId: string
        input: RunScenarioBatchInput
        resolve: (runs: SimulationRun[]) => void
        kind: 'batch'
      }
  > = []

  const dispatchNext = () => {
    workers.forEach((entry, index) => {
      if (entry.busy || queue.length === 0) {
        return
      }
      const next = queue.shift()
      if (!next) {
        return
      }
      entry.busy = true
      if (next.kind === 'batch') {
        pending.set(next.requestId, {
          resolve: next.resolve,
          workerIndex: index,
          kind: 'batch',
        })
        entry.worker.postMessage({
          type: 'runScenarioBatch',
          requestId: next.requestId,
          snapshot: next.input.snapshot,
          startDate: next.input.startDate,
          seeds: next.input.seeds,
        })
        return
      }
      pending.set(next.requestId, {
        resolve: next.resolve,
        workerIndex: index,
        kind: 'single',
      })
      entry.worker.postMessage({
        type: 'runScenario',
        requestId: next.requestId,
        input: next.input,
      })
    })
  }

  workers.forEach((entry) => {
    entry.worker.onmessage = (event) => {
      const message = event.data as RunScenarioResponse | RunScenarioBatchResponse
      if (message.type !== 'runScenarioResult' && message.type !== 'runScenarioBatchResult') {
        return
      }
      const pendingEntry = pending.get(message.requestId)
      if (!pendingEntry) {
        return
      }
      pending.delete(message.requestId)
      workers[pendingEntry.workerIndex].busy = false
      if (message.type === 'runScenarioBatchResult') {
        if (pendingEntry.kind === 'batch') {
          pendingEntry.resolve(message.runs)
        }
      } else if (pendingEntry.kind === 'single') {
        pendingEntry.resolve(message.run)
      }
      dispatchNext()
    }
    entry.worker.onerror = () => {
      entry.busy = false
      dispatchNext()
    }
  })

  const runScenario = (input: SimulationRequest) =>
    new Promise<SimulationRun>((resolve) => {
      const requestId = createUuid()
      queue.push({ requestId, input, resolve, kind: 'single' })
      dispatchNext()
    })

  const runScenarioBatch = (input: RunScenarioBatchInput) =>
    new Promise<SimulationRun[]>((resolve) => {
      const requestId = createUuid()
      queue.push({ requestId, input, resolve, kind: 'batch' })
      dispatchNext()
    })

  return { runScenario, runScenarioBatch }
}
