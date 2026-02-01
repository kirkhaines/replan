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
    ? Math.max(1, Math.round(coreHint * 0.8))
    : defaultWorkers
  const enableBatchLogs = false
  const logBatch = (...args: Parameters<typeof console.info>) => {
    if (enableBatchLogs) {
      console.info(...args)
    }
  }

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
      if (next.kind === 'batch') {
        logBatch('[SimClient] Dispatching queued request.', {
          ts: new Date().toISOString(),
          requestId: next.requestId,
          kind: next.kind,
          workerId: index,
          queueRemaining: queue.length,
        })
      } else {
        console.info('[SimClient] Dispatching queued request.', {
          ts: new Date().toISOString(),
          requestId: next.requestId,
          kind: next.kind,
          workerId: index,
          queueRemaining: queue.length,
        })
      }
      entry.busy = true
      if (next.kind === 'batch') {
        pending.set(next.requestId, {
          resolve: next.resolve,
          workerIndex: index,
          kind: 'batch',
        })
        logBatch('[SimClient] Posting batch to worker.', {
          ts: new Date().toISOString(),
          requestId: next.requestId,
          workerId: index,
          batchCount: next.input.seeds.length,
        })
        entry.worker.postMessage({
          type: 'runScenarioBatch',
          requestId: next.requestId,
          snapshot: next.input.snapshot,
          startDate: next.input.startDate,
          seeds: next.input.seeds,
          workerId: index,
        })
        logBatch('[SimClient] Batch posted to worker.', {
          ts: new Date().toISOString(),
          requestId: next.requestId,
          workerId: index,
        })
        return
      }
      pending.set(next.requestId, {
        resolve: next.resolve,
        workerIndex: index,
        kind: 'single',
      })
      console.info('[SimClient] Posting run to worker.', {
        ts: new Date().toISOString(),
        requestId: next.requestId,
        workerId: index,
      })
      entry.worker.postMessage({
        type: 'runScenario',
        requestId: next.requestId,
        input: next.input,
        workerId: index,
      })
      console.info('[SimClient] Run posted to worker.', {
        ts: new Date().toISOString(),
        requestId: next.requestId,
        workerId: index,
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
      if (pendingEntry.kind === 'batch') {
        logBatch('[SimClient] Worker response received.', {
          ts: new Date().toISOString(),
          requestId: message.requestId,
          type: message.type,
          workerId: pendingEntry.workerIndex,
          pendingRemaining: pending.size - 1,
        })
      } else {
        console.info('[SimClient] Worker response received.', {
          ts: new Date().toISOString(),
          requestId: message.requestId,
          type: message.type,
          workerId: pendingEntry.workerIndex,
          pendingRemaining: pending.size - 1,
        })
      }
      pending.delete(message.requestId)
      workers[pendingEntry.workerIndex].busy = false
      if (message.type === 'runScenarioBatchResult') {
        if (pendingEntry.kind === 'batch') {
          logBatch('[SimClient] Resolving batch request.', {
            ts: new Date().toISOString(),
            requestId: message.requestId,
            workerId: pendingEntry.workerIndex,
            runCount: message.runs.length,
          })
          pendingEntry.resolve(message.runs)
        }
      } else if (pendingEntry.kind === 'single') {
        console.info('[SimClient] Resolving run request.', {
          ts: new Date().toISOString(),
          requestId: message.requestId,
          workerId: pendingEntry.workerIndex,
        })
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
      console.info('[SimClient] Enqueue run request.', {
        ts: new Date().toISOString(),
        requestId,
        queueLength: queue.length,
      })
      queue.push({ requestId, input, resolve, kind: 'single' })
      dispatchNext()
    })

  const runScenarioBatch = (input: RunScenarioBatchInput) =>
    new Promise<SimulationRun[]>((resolve) => {
      const requestId = createUuid()
      logBatch('[SimClient] Enqueue batch request.', {
        ts: new Date().toISOString(),
        requestId,
        batchCount: input.seeds.length,
        queueLength: queue.length,
      })
      queue.push({ requestId, input, resolve, kind: 'batch' })
      dispatchNext()
    })

  return { runScenario, runScenarioBatch }
}
