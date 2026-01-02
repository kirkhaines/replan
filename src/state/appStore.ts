import { create } from 'zustand'
import { createDexieStorageClient } from '../core/storage/dexieClient'
import { createWorkerSimClient } from '../core/simClient/workerSimClient'
import type { StorageClient } from '../core/storage/types'
import type { ISimClient } from '../core/simClient/types'

type AppState = {
  storage: StorageClient
  simClient: ISimClient
}

const storage = createDexieStorageClient()
const simClient = createWorkerSimClient()

export const useAppStore = create<AppState>(() => ({
  storage,
  simClient,
}))
