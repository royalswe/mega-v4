import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { recalculateTargetSignals } from '@/lib/community/contentSignals'
import { bumpUserSignals, resolveID } from '@/lib/community/userSignals'

type TargetCollection = 'links' | 'posts'

const resolveTarget = (doc: {
  link?: unknown
  post?: unknown
}): { id: number; collection: TargetCollection } | null => {
  const linkId = resolveID(doc.link)
  if (linkId) return { id: linkId, collection: 'links' }

  const postId = resolveID(doc.post)
  if (postId) return { id: postId, collection: 'posts' }

  return null
}

const syncDiscoverySignals = async ({
  req,
  voterId,
  postId,
}: {
  req: Parameters<CollectionAfterChangeHook>[0]['req']
  voterId: number
  postId: number
}): Promise<void> => {
  const post = await req.payload.findByID({
    collection: 'posts',
    id: postId,
    depth: 0,
    overrideAccess: true,
    req,
  })

  if (!post) return

  const postAuthorId = resolveID(post.user)
  if (postAuthorId === voterId) return

  const isEarlyDiscovery = (post.upvotes ?? 0) <= 6 || (post.discoveryMomentum ?? 0) >= 20
  if (!isEarlyDiscovery) return

  const existing = await req.payload.find({
    collection: 'discoveries',
    where: {
      user: {
        equals: voterId,
      },
      post: {
        equals: postId,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const currentEngagement = existing.docs[0]?.engagementGenerated ?? 0
  const nextEngagement = Math.max(
    1,
    Math.floor(
      ((post.rankingScore ?? 0) + (post.upvotes ?? 0) * 4 + (post.commentsCount ?? 0) * 2) / 80,
    ),
  )

  if (existing.docs.length === 0) {
    await req.payload.create({
      collection: 'discoveries',
      data: {
        user: voterId,
        post: postId,
        discoveredAt: new Date().toISOString(),
        engagementGenerated: nextEngagement,
      },
      overrideAccess: true,
      req,
    })

    await bumpUserSignals(req, voterId, {
      discoveryScore: nextEngagement,
      interactionScore: 0.35,
    })

    return
  }

  if (nextEngagement > currentEngagement) {
    const delta = nextEngagement - currentEngagement

    await req.payload.update({
      collection: 'discoveries',
      id: existing.docs[0].id,
      data: {
        engagementGenerated: nextEngagement,
      },
      overrideAccess: true,
      req,
    })

    await bumpUserSignals(req, voterId, {
      discoveryScore: delta,
      interactionScore: 0.15,
    })
  }
}

const rewardUsersForVote = async ({
  req,
  target,
  voterId,
  vote,
  direction,
}: {
  req: Parameters<CollectionAfterChangeHook>[0]['req']
  target: { id: number; collection: TargetCollection }
  voterId: number | null
  vote: 'up' | 'down'
  direction: 1 | -1
}): Promise<void> => {
  if (!voterId) return

  const actorInteractionDelta = vote === 'up' ? 1 : 0.8
  await bumpUserSignals(req, voterId, {
    interactionScore: actorInteractionDelta * direction,
    securityScore: 0.05 * direction,
  })

  const targetDoc = await req.payload.findByID({
    collection: target.collection,
    id: target.id,
    depth: 0,
    overrideAccess: true,
    req,
  })

  if (!targetDoc) return

  const authorId = resolveID(targetDoc.user)
  if (!authorId || authorId === voterId) return

  const contributionDelta = vote === 'up' ? 1.2 : -0.7
  await bumpUserSignals(req, authorId, {
    contributionScore: contributionDelta * direction,
    legacyContributionScore: 0.2 * direction,
  })
}

/**
 * Hook to recalculate the total votes for a link whenever a vote is created, updated, or deleted.
 * This ensures the `votes` field on the `links` collection is always up-to-date.
 */
export const recalculateVotes: CollectionAfterChangeHook & CollectionAfterDeleteHook = async ({
  doc,
  req,
  ...rest
}) => {
  const target = resolveTarget(doc)
  if (!target) return

  const voterId = resolveID(doc.user)
  const operation = 'operation' in rest ? rest.operation : undefined

  try {
    await recalculateTargetSignals({
      req,
      targetCollection: target.collection,
      targetId: target.id,
    })

    if (operation) {
      await rewardUsersForVote({
        req,
        target,
        voterId,
        vote: doc.vote,
        direction: 1,
      })

      if (target.collection === 'posts' && doc.vote === 'up' && voterId) {
        await syncDiscoverySignals({
          req,
          voterId,
          postId: target.id,
        })
      }
    } else {
      await rewardUsersForVote({
        req,
        target,
        voterId,
        vote: doc.vote,
        direction: -1,
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    req.payload.logger.error(
      `Failed to recalculate vote signals for ${target.collection} ${target.id}: ${message}`,
    )
  }
}
