import { sql } from '@payloadcms/db-postgres'
import { createPayloadRequest, type Payload, type PayloadRequest } from 'payload'

import { deriveLinkDiscoveryMomentum, recalculateTargetSignals } from './contentSignals'
import { hasRankingScoreDrifted } from './ranking'
import { withSerializableTransaction } from '@/lib/withSerializableTransaction'

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
    const clearSelectedWindow = async (transactionReq: PayloadRequest): Promise<void> => {
      const transactionID = await transactionReq.transactionID
      const tx = transactionID ? payload.db.sessions[transactionID]?.db : undefined
      const tableName = payload.db.tableNameMap.get(collection)
      const table = tableName ? payload.db.tables[tableName] : undefined
      if (!tx || !('execute' in tx) || !table) {
        throw new Error('Editorial expiry requires an active PostgreSQL transaction')
      }

      // Lock before comparing so a renewed window cannot be cleared by a stale sweep.
      await tx.execute(sql`
        SELECT ${table.id} FROM ${table} WHERE ${table.id} = ${doc.id} FOR UPDATE
      `)
      const current = await payload.findByID({
        collection,
        id: doc.id,
        depth: 0,
        overrideAccess: true,
        req: transactionReq,
      })
      if (
        !current.editorialPriority ||
        current.editorialPriorityUntil !== doc.editorialPriorityUntil
      )
        return

      await recalculateTargetSignals({
        payload,
        req: transactionReq,
        targetCollection: collection,
        targetId: doc.id,
        now,
      })

      await payload.update({
        collection,
        id: doc.id,
        data: { editorialPriority: false, editorialPriorityUntil: null },
        overrideAccess: true,
        req: transactionReq,
      })
    }

    if (req?.transactionID) {
      await clearSelectedWindow(req)
    } else {
      await withSerializableTransaction(payload, async (transactionReq) => {
        await clearSelectedWindow(
          await createPayloadRequest({ payload, req: { ...req, ...transactionReq } }),
        )
      })
    }
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

/**
 * Stale-ranking refresh sweep (ticket #36).
 *
 * `rankingScore` is persisted on write, but freshness decay keeps lowering the
 * score an item *would* earn as it ages. Without a periodic refresh the stored
 * score keeps sorting content by the clock of its last write. This sweep walks
 * the highest-ranked items in both content collections, compares the persisted
 * score against a live computation at `now`, and recalculates the ones that
 * drifted. Recalculating only drifted rows keeps it cheap enough to run from a
 * maintenance/cron path.
 */

export interface RefreshStaleContentRankingResult {
  refreshed: number
}

export interface RefreshStaleContentRankingArgs {
  payload: Payload
  /** Optional request scope, so callers keep their transaction. */
  req?: PayloadRequest
  /** Injectable clock (defaults to now). */
  now?: Date
  /** Absolute score delta tolerated before a row counts as drifted. */
  tolerance?: number
  /** How many top-ranked rows to inspect per collection. */
  limit?: number
}

/** Structural subset of a ranking-bearing content doc used for drift checks. */
interface RankingSignalSnapshot {
  createdAt?: string | null
  upvotes?: number | null
  downvotes?: number | null
  commentsCount?: number | null
  sharesCount?: number | null
  uniqueCommenters?: number | null
  trustedInteractions?: number | null
  discoveryMomentum?: number | null
  clickCount?: number | null
  editorialPriority?: boolean | null
  editorialPriorityUntil?: string | null
  feed?: string | null
  rankingScore?: number | null
}

export const refreshStaleContentRanking = async ({
  payload,
  req,
  now = new Date(),
  tolerance,
  limit = 50,
}: RefreshStaleContentRankingArgs): Promise<RefreshStaleContentRankingResult> => {
  const reqScope = req ? { req } : {}
  let refreshed = 0

  for (const collection of CONTENT_COLLECTIONS) {
    const ranked = await payload.find({
      collection,
      sort: '-rankingScore',
      limit,
      depth: 0,
      overrideAccess: true,
      ...reqScope,
    })

    for (const doc of ranked.docs) {
      const snapshot = doc as unknown as RankingSignalSnapshot

      const drifted = hasRankingScoreDrifted(
        {
          createdAt: snapshot.createdAt,
          upvotes: snapshot.upvotes ?? 0,
          downvotes: snapshot.downvotes ?? 0,
          commentsCount: snapshot.commentsCount ?? 0,
          sharesCount: snapshot.sharesCount ?? 0,
          uniqueCommenters: snapshot.uniqueCommenters ?? 0,
          trustedInteractions: snapshot.trustedInteractions ?? 0,
          // Links derive momentum from clicks; posts persist their own value.
          discoveryMomentum:
            collection === 'links'
              ? deriveLinkDiscoveryMomentum(snapshot.clickCount ?? 0)
              : (snapshot.discoveryMomentum ?? 0),
          editorialPriority: snapshot.editorialPriority,
          editorialPriorityUntil: snapshot.editorialPriorityUntil,
          feed: snapshot.feed,
          rankingScore: snapshot.rankingScore,
        },
        { now, tolerance },
      )

      if (!drifted) continue

      await recalculateTargetSignals({
        payload,
        req,
        targetCollection: collection,
        targetId: doc.id,
        now,
      })
      refreshed += 1
    }
  }

  return { refreshed }
}
