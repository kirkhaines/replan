import { v4 as uuidv4 } from 'uuid'

export const createUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return uuidv4()
}
