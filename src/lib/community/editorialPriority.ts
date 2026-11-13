import type { Payload, PayloadRequest } from 'payload'

import { recalculateTargetSignals } from './contentSignals'

/**
 * Editorial-priority expiry sweep (Bobhund suggestion #1).
 *
 * An editorial window is a *time-bounded* promise: after
 * `editorialPriorityUntil` passes, the +120 ranking boost must stop counting.
 * `calculateRanking` already treats an expired window as inactive, but
 * `rankingScore` is only recomputed on writes, so without a sweep the stale
 * boosted score would keep sorting content until the next vote/comment.
 *
 * This sweep finds expired editorial items in both content collections,
 * recomputes their signals (which drops the boost), and clears the flag so the
 * same rows are not re-processed on every request. It is safe to call from a
 * render path: the query is indexed and usually returns zero rows.
 */

const SWEEP_INTERVAL_MS = 60_000
const BATCH_SIZE = 100
const CONTENT_COLLECTIONS = ['links', 'posts'] as const

type ContentCollection = (typeof CONTENT_COLLECTIONS)[number]

let lastSweepAt = 0
let inFlight: Promise<EditorialPrioritySweepResult> | null = null

export interface EditorialPrioritySweepResult {
  processed: number
}

interface ExpireEditorialPriorityArgs {
  payload: Payload
  /** Optional request scope, so hook callers keep their transaction. */
  req?: PayloadRequest
  /** Ignore the in-process throttle (used by tests and cron endpoints). */
  force?: boolean
  /** Injectable clock (tests). */
  now?: Date
}

const clearExpiredBatch = async (
  payload: Payload,
  req: PayloadRequest | undefined,
  collection: ContentCollection,
  now: Date,
): Promise<number> => {
  const reqScope = req ? { req } : {}
  const expired = await payload.find({
    collection,
    where: {
      and: [
        { editorialPriority: { equals: true } },
        { editorialPriorityUntil: { less_than: now.toISOString() } },
      ],
    },
    limit: BATCH_SIZE,
    depth: 0,
    overrideAccess: true,
    ...reqScope,
  })

  if (expired.docs.length === 0) return 0

  for (const doc of expired.docs) {
    await recalculateTargetSignals({
      payload,
      req,
      targetCollection: collection,
      targetId: doc.id,
      now,
    })

    await payload.update({
      collection,
      id: doc.id,
      data: { editorialPriority: false, editorialPriorityUntil: null },
      overrideAccess: true,
      ...reqScope,
    })
  }

  return expired.docs.length
}

const runSweep = async ({
  payload,
  req,
  now = new Date(),
}: ExpireEditorialPriorityArgs): Promise<EditorialPrioritySweepResult> => {
  let processed = 0

  for (const collection of CONTENT_COLLECTIONS) {
    let batchSize = await clearExpiredBatch(payload, req, collection, now)
    processed += batchSize

    while (batchSize === BATCH_SIZE) {
      batchSize = await clearExpiredBatch(payload, req, collection, now)
      processed += batchSize
    }
  }

  return { processed }
}

export const expireEditorialPriority = async (
  args: ExpireEditorialPriorityArgs,
): Promise<EditorialPrioritySweepResult> => {
  if (!args.force && Date.now() - lastSweepAt < SWEEP_INTERVAL_MS) {
    return { processed: 0 }
  }

  // Collapse concurrent renders into one sweep.
  if (inFlight) return inFlight

  lastSweepAt = Date.now()
  inFlight = runSweep(args).finally(() => {
    inFlight = null
  })

  return inFlight
}

/** Test helper: reset the in-process throttle so a sweep can run immediately. */
export const resetEditorialPrioritySweepThrottle = (): void => {
  lastSweepAt = 0
  inFlight = null
}
