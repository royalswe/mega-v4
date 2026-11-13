import type { Payload, PayloadRequest } from 'payload'

import { calculateRanking } from './ranking'
import { isTrustedUser } from './userSignals'

type TargetCollection = 'links' | 'posts'

interface RecalculateArgs {
  /** Request scope; when present, all nested calls stay inside its transaction. */
  req?: PayloadRequest
  /** Payload instance for callers without a request (e.g. the expiry sweep). */
  payload?: Payload
  targetCollection: TargetCollection
  targetId: number
  /** Injectable clock (used by the editorial-expiry sweep and tests). */
  now?: Date
}

type TargetSignalDoc = {
  createdAt?: string | null
  clickCount?: number | null
  sharesCount?: number | null
  editorialPriority?: boolean | null
  editorialPriorityUntil?: string | null
  feed?: string | null
}

export const recalculateTargetSignals = async ({
  req,
  payload,
  targetCollection,
  targetId,
  now,
}: RecalculateArgs): Promise<void> => {
  const db = req?.payload ?? payload
  if (!db) {
    throw new Error('recalculateTargetSignals requires either `req` or `payload`')
  }
  const reqScope = req ? { req } : {}
  const voteField = targetCollection === 'links' ? 'link' : 'post'

  const [targetDoc, votesResult, commentsResult] = await Promise.all([
    db.findByID({
      collection: targetCollection,
      id: targetId,
      depth: 0,
      overrideAccess: true,
      ...reqScope,
    }),
    db.find({
      collection: 'votes',
      where: {
        [voteField]: {
          equals: targetId,
        },
      },
      pagination: false,
      depth: 1,
      overrideAccess: true,
      ...reqScope,
    }),
    db.find({
      collection: 'comments',
      where: {
        [voteField]: {
          equals: targetId,
        },
        moderationStatus: {
          not_equals: 'removed',
        },
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      ...reqScope,
    }),
  ])

  if (!targetDoc) return
  const targetDocData = targetDoc as TargetSignalDoc

  let upvotes = 0
  let downvotes = 0
  let trustedInteractions = 0

  for (const vote of votesResult.docs) {
    if (vote.vote === 'up') upvotes += 1
    if (vote.vote === 'down') downvotes += 1

    if (vote.user && typeof vote.user === 'object' && isTrustedUser(vote.user)) {
      trustedInteractions += 1
    }
  }

  const commentsCount = commentsResult.docs.length
  const uniqueCommenters = new Set(
    commentsResult.docs
      .map((comment) => {
        if (typeof comment.user === 'number') return comment.user
        if (comment.user && typeof comment.user === 'object') return comment.user.id
        return null
      })
      .filter((id): id is number => typeof id === 'number'),
  ).size

  let discoveryMomentum = 0

  if (targetCollection === 'posts') {
    const discoveries = await db.find({
      collection: 'discoveries',
      where: {
        post: {
          equals: targetId,
        },
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      ...reqScope,
    })

    discoveryMomentum = discoveries.docs.reduce((acc, discovery) => {
      return acc + Math.max(0, discovery.engagementGenerated ?? 0)
    }, 0)

    discoveryMomentum = Math.round((discoveryMomentum + discoveries.docs.length * 8) * 100) / 100
  } else {
    const clickCount =
      typeof targetDocData.clickCount === 'number' && Number.isFinite(targetDocData.clickCount)
        ? targetDocData.clickCount
        : 0

    discoveryMomentum = Math.round(clickCount * 0.35 * 100) / 100
  }

  const ranking = calculateRanking({
    createdAt: targetDocData.createdAt ?? new Date().toISOString(),
    upvotes,
    downvotes,
    commentsCount,
    sharesCount:
      typeof targetDocData.sharesCount === 'number' && Number.isFinite(targetDocData.sharesCount)
        ? targetDocData.sharesCount
        : 0,
    uniqueCommenters,
    trustedInteractions,
    discoveryMomentum,
    editorialPriority: Boolean(targetDocData.editorialPriority),
    editorialPriorityUntil: targetDocData.editorialPriorityUntil,
    feed: targetDocData.feed,
    now,
  })

  const score = upvotes - downvotes
  const organicScore = ranking.score - ranking.editorialBoost - ranking.subfeedBoost
  const createdAt = targetDocData.createdAt ?? new Date().toISOString()
  const ageHours = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 3_600_000)

  await db.update({
    collection: targetCollection,
    id: targetId,
    data: {
      votes: score,
      score,
      upvotes,
      downvotes,
      commentsCount,
      uniqueCommenters,
      trustedInteractions,
      discoveryMomentum,
      engagementVelocity: ranking.engagementVelocity,
      controversyScore: ranking.controversyScore,
      spamProbability: ranking.spamProbability,
      ragebaitProbability: ranking.ragebaitProbability,
      rankingScore: ranking.score,
      breaking: organicScore >= 180 && ageHours <= 24,
      featured: organicScore >= 120 && ranking.spamProbability < 0.55,
      controversial: ranking.controversyScore >= 45 || ranking.ragebaitProbability >= 0.6,
    },
    overrideAccess: true,
    ...reqScope,
  } as Parameters<typeof db.update>[0])
}
