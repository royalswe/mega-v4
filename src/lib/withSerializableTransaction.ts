import { randomUUID } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'

const isTransactionConflict = (error: unknown): boolean => {
  const seen = new Set<unknown>()
  let current = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const { code, cause } = current as { code?: unknown; cause?: unknown }
    if (code === '40001' || code === '40P01') return true
    current = cause
  }
  return false
}

/**
 * Re-run read/modify/write operations against a fresh snapshot after a database
 * conflict. The callback must thread req through every read and write and must
 * not perform external side effects (including cache revalidation).
 */
export const withSerializableTransaction = async <T>(
  payload: Payload,
  operation: (req: Pick<PayloadRequest, 'transactionID'>) => Promise<T>,
): Promise<T> => {
  if (!payload.db.drizzle || !payload.db.sessions) {
    throw new Error('This operation requires PostgreSQL database transactions')
  }
  await payload.db.initializing

  for (let attempt = 0; ; attempt++) {
    try {
      // beta.7's adapter commitTransaction swallows commit errors. Own the native
      // boundary so PostgreSQL commit-time serialization failures reach the retry.
      return await payload.db.drizzle.transaction(
        async (tx) => {
          const transactionID = randomUUID()
          let aborted = false
          payload.db.sessions[transactionID] = {
            db: tx,
            resolve: async () => {
              throw new Error('Only the transaction boundary may commit this operation')
            },
            reject: async () => {
              aborted = true
            },
          }
          try {
            const result = await operation({ transactionID })
            if (aborted) throw new Error('The database transaction was aborted')
            return result
          } finally {
            delete payload.db.sessions[transactionID]
          }
        },
        { isolationLevel: 'serializable' },
      )
    } catch (error) {
      if (attempt >= 4 || !isTransactionConflict(error)) throw error
    }
  }
}
