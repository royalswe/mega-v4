'use server'

import { revalidatePath } from 'next/cache'

import { getAuthenticatedUser } from '@/lib/auth'
import {
  DISCOVERY_BOOST_INELIGIBLE_MESSAGE,
  DISCOVERY_BOOST_REQUIRED_MESSAGE,
  hasDiscoveryBoostStanding,
  isEligibleForMainFeedPromotion,
} from '@/lib/community/promotion'
import type {
  PromotableItemLike,
  PromotionCollectionSlug,
} from '@/lib/community/promotion'
import { canModerateCommunity } from '@/lib/community/subfeeds'
import { resolveID } from '@/lib/community/userSignals'

const VALID_COLLECTIONS: PromotionCollectionSlug[] = ['links', 'posts']

const assertValidTarget = (collection: string, id: number): void => {
  if (!VALID_COLLECTIONS.includes(collection as PromotionCollectionSlug)) {
    throw new Error('Invalid content type')
  }
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid content')
  }
}

/**
 * Curated discovery boost: surfaces a qualifying SubFeed/User Feed item into
 * the Main Feed.
 *
 * Security pattern (the sanctioned exception to `overrideAccess: false`):
 * the boost fields (`discoveryBoosted`, `boostedAt`, `boostedBy`) are
 * admin-only at the field level, so a discovery-standing member cannot write
 * them through normal access. We therefore write with `overrideAccess: true`
 * and pass `context: { discoveryBoost: { userId } }`. The collection
 * `beforeChange` hook (see `createDiscoveryBoostEnforcementHook`) is the real
 * enforcement: it re-validates the booster's standing, checks the update only
 * touches boost fields, re-validates the target's promotion eligibility, and
 * forces the boost values from the trusted context.
 */
export async function boostToMainFeed({
  collection,
  id,
}: {
  collection: PromotionCollectionSlug
  id: number
}) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to boost content')
  }

  assertValidTarget(collection, id)

  // Gate: site admin/moderator/editor OR decayed discovery standing.
  const profile = await payload.findByID({
    collection: 'users',
    id: user.id,
    depth: 0,
    overrideAccess: true,
  })

  if (!hasDiscoveryBoostStanding(profile as never)) {
    throw new Error(DISCOVERY_BOOST_REQUIRED_MESSAGE)
  }

  // Re-check the target server-side before writing.
  const target = await payload.findByID({
    collection,
    id,
    depth: 0,
    overrideAccess: true,
  })

  if (!target) {
    throw new Error('Content not found')
  }

  if (!isEligibleForMainFeedPromotion(target as PromotableItemLike)) {
    throw new Error(DISCOVERY_BOOST_INELIGIBLE_MESSAGE)
  }

  await payload.update({
    collection,
    id,
    data: {
      discoveryBoosted: true,
      boostedAt: new Date().toISOString(),
      boostedBy: user.id,
    },
    overrideAccess: true,
    context: { discoveryBoost: { userId: user.id } },
  })

  revalidatePath('/')
  revalidatePath('/wall')

  return { boosted: true, id }
}

/**
 * Rolls a curated discovery boost back. Minimal for ticket #18: site
 * admin/moderator/editor or the original booster may unboost; richer rollback
 * tooling arrives with the emergency quarantine UI in #19.
 */
export async function unboostFromMainFeed({
  collection,
  id,
}: {
  collection: PromotionCollectionSlug
  id: number
}) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to unboost content')
  }

  assertValidTarget(collection, id)

  const target = await payload.findByID({
    collection,
    id,
    depth: 0,
    overrideAccess: true,
  })

  if (!target) {
    throw new Error('Content not found')
  }

  const originalBoosterId = resolveID(target.boostedBy)
  if (!canModerateCommunity(user) && originalBoosterId !== user.id) {
    throw new Error(
      'Only the member who boosted this content or a site moderator/editor can unboost it.',
    )
  }

  await payload.update({
    collection,
    id,
    data: {
      discoveryBoosted: false,
      boostedAt: null,
      boostedBy: null,
    },
    overrideAccess: true,
    context: { discoveryBoost: { userId: user.id, unboost: true } },
  })

  revalidatePath('/')
  revalidatePath('/wall')

  return { boosted: false, id }
}

/**
 * Toggles or sets the quarantine status of a link or post.
 * Quarantined content is immediately excluded from all public and promoted feeds.
 * Dedicated administrator/moderator safety control (ticket #19).
 */
export async function setQuarantineContent({
  collection,
  id,
  quarantined,
}: {
  collection: PromotionCollectionSlug
  id: number
  quarantined: boolean
}) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user || !canModerateCommunity(user)) {
    throw new Error('Only administrators and moderators can quarantine content')
  }

  assertValidTarget(collection, id)

  const target = await payload.findByID({
    collection,
    id,
    depth: 0,
    overrideAccess: true,
  })

  if (!target) {
    throw new Error('Content not found')
  }

  await payload.update({
    collection,
    id,
    data: {
      quarantined,
    },
    overrideAccess: true,
  })

  revalidatePath('/')
  revalidatePath('/wall')
  revalidatePath('/submitted')
  if (collection === 'links') {
    revalidatePath(`/link/${id}`)
  } else {
    revalidatePath(`/post/${id}`)
  }

  return { id, quarantined }
}

export const quarantineContent = setQuarantineContent

/**
 * Emergency rollback of any promotion on a link or post:
 * clears discovery boost, featured status, and active editorial priority,
 * and restores standard organic ranking.
 * Dedicated administrator/moderator safety control (ticket #19).
 */
export async function rollbackPromotion({
  collection,
  id,
}: {
  collection: PromotionCollectionSlug
  id: number
}) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user || !canModerateCommunity(user)) {
    throw new Error('Only administrators and moderators can rollback promotions')
  }

  assertValidTarget(collection, id)

  const target = await payload.findByID({
    collection,
    id,
    depth: 0,
    overrideAccess: true,
  })

  if (!target) {
    throw new Error('Content not found')
  }

  await payload.update({
    collection,
    id,
    data: {
      featured: false,
      discoveryBoosted: false,
      boostedAt: null,
      boostedBy: null,
      editorialPriority: false,
      editorialPriorityUntil: null,
    },
    overrideAccess: true,
    context: { rollbackPromotion: true },
  })

  revalidatePath('/')
  revalidatePath('/wall')
  if (collection === 'links') {
    revalidatePath(`/link/${id}`)
  } else {
    revalidatePath(`/post/${id}`)
  }

  return { id, rolledBack: true }
}
