import type { CollectionBeforeChangeHook, Payload, PayloadRequest } from 'payload'

import { calculateRanking, EDITORIAL_PRIORITY_DURATION_MS } from './ranking'
import type { RankingOutput } from './ranking'
import { getNumericFieldValue } from './signalFields'
import { canManageSubmittedLinks } from './subfeeds'
import { isTrustedUser, resolveID } from './userSignals'

type TargetCollection = 'links' | 'posts'

/** Controversy threshold on `RankingOutput.controversyScore`. */
export const CONTROVERSY_SCORE_THRESHOLD = 45
/** Controversy threshold on `RankingOutput.ragebaitProbability`. */
export const RAGEBAIT_PROBABILITY_THRESHOLD = 0.6
/** Weight applied to link clicks when deriving discovery momentum. */
export const LINK_CLICK_DISCOVERY_WEIGHT = 0.35
/** Organic ranking score above which content is promoted to `featured`. */
export const ORGANIC_FEATURED_SCORE_THRESHOLD = 120
/** Organic ranking score above which fresh content is marked `breaking`. */
export const ORGANIC_BREAKING_SCORE_THRESHOLD = 180
/** Highest spam probability that still allows organic `featured` promotion. */
export const ORGANIC_FEATURED_MAX_SPAM_PROBABILITY = 0.55

/** Hours after publication during which high-scoring content is `breaking`. */
const BREAKING_WINDOW_HOURS = 24

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
  featured?: boolean | null
  feed?: string | null
}

/**
 * Link discovery momentum is derived from click volume. Keeping the
 * derivation in one place guarantees the `beforeChange` sync hook and the
 * vote/comment recalculation agree.
 */
export const deriveLinkDiscoveryMomentum = (clickCount: number): number =>
  Math.round(Math.max(0, clickCount) * LINK_CLICK_DISCOVERY_WEIGHT * 100) / 100

/** Canonical controversy rule shared by both content collections. */
export const isControversialFromRanking = (
  ranking: Pick<RankingOutput, 'controversyScore' | 'ragebaitProbability'>,
): boolean =>
  ranking.controversyScore >= CONTROVERSY_SCORE_THRESHOLD ||
  ranking.ragebaitProbability >= RAGEBAIT_PROBABILITY_THRESHOLD

/**
 * Grants a time-bounded editorial priority window to direct Main Feed
 * publications by recognized editorial publishers (ticket #19).
 *
 * This MUST be a `beforeChange` hook (running after field validation), not a
 * `beforeValidate` hook: the `editorialPriority` fields have moderator-only
 * field-level access, so values written during `beforeValidate` are stripped
 * during validation for non-moderator actors. Values written by `beforeChange`
 * hooks are persisted — the same sanctioned pattern the discovery-boost hook
 * uses for its server-derived fields.
 */
export const createGrantEditorialPriorityHook = (
  targetCollection: TargetCollection,
): CollectionBeforeChangeHook => {
  return async ({ data, originalDoc, operation, req }) => {
    if (req?.context?.skipHooks) return data
    if (!data) return data

    const feed = data.feed ?? originalDoc?.feed
    if (feed !== 'main') return data

    if (targetCollection === 'posts') {
      if ((data.status ?? originalDoc?.status) !== 'published') return data
      if (
        operation !== 'create' &&
        originalDoc?.feed === 'main' &&
        originalDoc?.status === 'published'
      ) {
        return data
      }
    } else if (operation !== 'create' && originalDoc?.feed === 'main') {
      return data
    }

    const authorId = resolveID(data.user) ?? resolveID(originalDoc?.user) ?? req.user?.id ?? null
    let hasEditorialRole = false

    if (req.user && req.user.id === authorId && Array.isArray(req.user.roles)) {
      hasEditorialRole = canManageSubmittedLinks(req.user)
    } else if (authorId) {
      const author = await req.payload.findByID({
        collection: 'users',
        id: authorId,
        depth: 0,
        overrideAccess: true,
        req,
      })
      hasEditorialRole = Boolean(author && canManageSubmittedLinks(author))
    }

    if (!hasEditorialRole) return data

    return {
      ...data,
      editorialPriority: true,
      editorialPriorityUntil: new Date(Date.now() + EDITORIAL_PRIORITY_DURATION_MS).toISOString(),
    }
  }
}

/**
 * Derives the denormalised ranking/engagement fields on write. Shared between
 * Links and Posts so both collections compute identical signals; only the
 * discovery-momentum source differs (link clicks vs. stored post momentum).
 */
export const createSyncDerivedSignalsHook = (
  targetCollection: TargetCollection,
): CollectionBeforeChangeHook => {
  return ({ data, originalDoc, req }) => {
    if (req?.context?.skipHooks) return data

    const upvotes = getNumericFieldValue(data, originalDoc, 'upvotes')
    const downvotes = getNumericFieldValue(data, originalDoc, 'downvotes')
    const commentsCount = getNumericFieldValue(data, originalDoc, 'commentsCount')
    const sharesCount = getNumericFieldValue(data, originalDoc, 'sharesCount')
    const uniqueCommenters = getNumericFieldValue(data, originalDoc, 'uniqueCommenters')
    const trustedInteractions = getNumericFieldValue(data, originalDoc, 'trustedInteractions')
    const discoveryMomentum =
      targetCollection === 'links'
        ? deriveLinkDiscoveryMomentum(getNumericFieldValue(data, originalDoc, 'clickCount'))
        : getNumericFieldValue(data, originalDoc, 'discoveryMomentum')

    const editorialPriority =
      data.editorialPriority !== undefined
        ? Boolean(data.editorialPriority)
        : Boolean(originalDoc?.editorialPriority)
    const editorialPriorityUntil =
      data.editorialPriorityUntil !== undefined
        ? data.editorialPriorityUntil
        : originalDoc?.editorialPriorityUntil

    const ranking = calculateRanking({
      createdAt: originalDoc?.createdAt || new Date().toISOString(),
      upvotes,
      downvotes,
      commentsCount,
      sharesCount,
      uniqueCommenters,
      trustedInteractions,
      discoveryMomentum,
      editorialPriority,
      editorialPriorityUntil,
      feed: data.feed ?? originalDoc?.feed,
    })

    const score = upvotes - downvotes
    const derived = {
      votes: score,
      score,
      controversyScore: ranking.controversyScore,
      engagementVelocity: ranking.engagementVelocity,
      spamProbability: ranking.spamProbability,
      ragebaitProbability: ranking.ragebaitProbability,
      rankingScore: ranking.score,
      controversial: isControversialFromRanking(ranking),
    }

    return targetCollection === 'links'
      ? { ...data, ...derived, discoveryMomentum }
      : { ...data, ...derived }
  }
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
  const referenceNow = now ?? new Date()

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

    discoveryMomentum = deriveLinkDiscoveryMomentum(clickCount)
  }

  const createdAt = targetDocData.createdAt ?? referenceNow.toISOString()

  const ranking = calculateRanking({
    createdAt,
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
    now: referenceNow,
  })

  const score = upvotes - downvotes
  const organicScore = ranking.score - ranking.editorialBoost - ranking.subfeedBoost
  const ageHours = Math.max(0, (referenceNow.getTime() - new Date(createdAt).getTime()) / 3_600_000)

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
      breaking: organicScore >= ORGANIC_BREAKING_SCORE_THRESHOLD && ageHours <= BREAKING_WINDOW_HOURS,
      // Manual moderation wins: a moderator-featured item stays featured while
      // its spam probability remains acceptable. Organic promotion still
      // applies when the score threshold is crossed.
      featured:
        (Boolean(targetDocData.featured) || organicScore >= ORGANIC_FEATURED_SCORE_THRESHOLD) &&
        ranking.spamProbability < ORGANIC_FEATURED_MAX_SPAM_PROBABILITY,
      controversial: isControversialFromRanking(ranking),
    },
    overrideAccess: true,
    // The recalculation already derives every field below; skipping content
    // hooks prevents the write from recomputing them against the real clock
    // (which would discard an injected `now`).
    context: { skipHooks: true },
    ...reqScope,
  } as Parameters<typeof db.update>[0])
}
