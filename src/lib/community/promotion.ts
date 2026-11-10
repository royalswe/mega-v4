import type { Where } from 'payload'

import { recencyDecayFactor } from './reputation'
import { canModerateCommunity } from './subfeeds'

/**
 * Unified Main Feed promotion policy (ticket #18).
 *
 * This module is the single source of truth for deciding whether content
 * published to a SubFeed or a User Feed may rise into the Main Feed. It is
 * deliberately pure (no Payload request scope) so the policy can be shared
 * between the Home feed query builders, the server-action boost gate, the
 * collection-hook re-validation, and unit/integration tests.
 *
 * Promotion for non-main origins is:
 *
 *   feed IN (subfeed, user)
 *     AND safety exclusions (controversial, soft-deleted/removed, quarantined)
 *     AND (featured OR organic threshold gate OR discoveryBoosted)
 *
 * The safety exclusions are *authoritative*: they wrap every promotion branch,
 * including the `featured` fast path (previously `featured` bypassed the
 * `controversial` check — that is fixed here). They are NOT applied to native
 * `feed: 'main'` content, which keeps its existing behaviour.
 */

/** Engagement thresholds required for a non-main item to rise into the Main Feed. */
export const MAIN_FEED_PROMOTION_THRESHOLD = {
  score: 4,
  upvotes: 5,
  rankingScore: 100,
} as const

/**
 * Discovery-momentum gate for organic promotion.
 *
 * For links, `discoveryMomentum` is `clickCount * 0.35`, so a gate of 5 maps to
 * ~15 tracked clicks — enough to distinguish a genuinely *discovered* item from
 * one that was merely upvoted in a small group. For posts it is seeded
 * independently in the same 0..80 band. 5 sits low enough to be reachable by
 * organic early momentum while filtering out zero-traction content.
 */
export const PROMOTION_DISCOVERY_MOMENTUM_MIN = 5

/**
 * Engagement-velocity gate for organic promotion.
 *
 * `engagementVelocity` is `interactions / (ageHours + 2)`. A gate of 5 means an
 * item must attract ~10 interactions within its first couple of hours (or keep
 * a sustained trickle). Combined with the existing `upvotes >= 5` requirement,
 * this ensures the threshold branch only fires for content with real, early
 * momentum rather than a handful of votes that happened to be fresh.
 */
export const PROMOTION_ENGAGEMENT_VELOCITY_MIN = 5

/**
 * Decayed discovery standing required to curate-boost content into the Main
 * Feed ("Discovery standing").
 *
 * 60 mirrors two existing, calibrated milestones in the standing engine: the
 * uploader discovery gate (`canUploadPromote` requires `discovery >= 60` at
 * Recognized trust) and the strong-recruiter threshold
 * (`SUBFEED_STRONG_RECRUITER_THRESHOLD = 60`). Reusing 60 keeps "Discovery
 * standing" aligned with what the community already treats as meaningful
 * discovery authority, so the boost pathway cannot be gamed by fresh accounts.
 */
export const DISCOVERY_BOOST_MIN_SCORE = 60

/** Field names that the curated-boost pathway is allowed to write. */
export const BOOST_FIELD_NAMES = ['discoveryBoosted', 'boostedAt', 'boostedBy'] as const

export const DISCOVERY_BOOST_REQUIRED_MESSAGE =
  'You need Discovery standing to boost content into the Main Feed. Earn discovery points by surfacing quality content, or ask a moderator or editor to feature it.'

export const DISCOVERY_BOOST_INELIGIBLE_MESSAGE =
  'This content cannot be boosted into the Main Feed. Content must be published, non-controversial, and not soft-deleted or quarantined.'

/** Which "removed/soft-deleted" field a collection uses for the safety gate. */
export type PromotionCollectionSlug = 'links' | 'posts'

export interface PromotionWhereOptions {
  collection?: PromotionCollectionSlug
}

/** Structural subset of a Link/Post needed for the pure eligibility predicate. */
export interface PromotableItemLike {
  feed?: string | null
  featured?: boolean | null
  discoveryBoosted?: boolean | null
  score?: number | null
  upvotes?: number | null
  rankingScore?: number | null
  discoveryMomentum?: number | null
  engagementVelocity?: number | null
  controversial?: boolean | null
  softDeleted?: boolean | null
  quarantined?: boolean | null
  /** Posts express soft-delete via `status: 'removed'`; links have no `status`. */
  status?: string | null
}

const readNum = (value?: number | null): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const isRemoved = (item: PromotableItemLike): boolean =>
  item.softDeleted === true || item.status === 'removed'

/** True when the item passes the organic engagement/momentum threshold gate. */
export const passesOrganicThreshold = (item: PromotableItemLike): boolean => {
  const hasMomentum =
    readNum(item.discoveryMomentum) >= PROMOTION_DISCOVERY_MOMENTUM_MIN ||
    readNum(item.engagementVelocity) >= PROMOTION_ENGAGEMENT_VELOCITY_MIN

  return (
    readNum(item.score) >= MAIN_FEED_PROMOTION_THRESHOLD.score &&
    readNum(item.upvotes) >= MAIN_FEED_PROMOTION_THRESHOLD.upvotes &&
    readNum(item.rankingScore) >= MAIN_FEED_PROMOTION_THRESHOLD.rankingScore &&
    hasMomentum
  )
}

/**
 * Pure predicate: is this item eligible to appear in the Main Feed as promoted
 * (non-main) content? Used by the boost action and hook to re-validate targets
 * server-side, and by tests.
 *
 * Note: `discoveryBoosted` is intentionally NOT a qualifying factor here. The
 * curated boost is the *outcome* of an authorised write, so the eligibility
 * check used to gate that write must only consider organic signals (featured or
 * thresholds). This prevents a boost from validating itself.
 */
export const isEligibleForMainFeedPromotion = (item: PromotableItemLike): boolean => {
  if (item.feed !== 'subfeed' && item.feed !== 'user') return false
  if (item.controversial === true) return false
  if (isRemoved(item)) return false
  if (item.quarantined === true) return false
  if (item.featured === true) return true
  return passesOrganicThreshold(item)
}

/** Safety exclusions applied to every promotion branch (but not main-feed native). */
export const buildSafetyExclusions = (options: PromotionWhereOptions = {}): Where[] => {
  const exclusions: Where[] = [
    { controversial: { not_equals: true } },
    { quarantined: { not_equals: true } },
  ]

  if (options.collection === 'posts') {
    exclusions.push({ status: { not_equals: 'removed' } })
  } else {
    exclusions.push({ softDeleted: { not_equals: true } })
  }

  return exclusions
}

/** The organic threshold gate, expressed as a Payload query fragment. */
const thresholdGate: Where = {
  and: [
    { score: { greater_than_equal: MAIN_FEED_PROMOTION_THRESHOLD.score } },
    { upvotes: { greater_than_equal: MAIN_FEED_PROMOTION_THRESHOLD.upvotes } },
    { rankingScore: { greater_than_equal: MAIN_FEED_PROMOTION_THRESHOLD.rankingScore } },
    {
      or: [
        { discoveryMomentum: { greater_than_equal: PROMOTION_DISCOVERY_MOMENTUM_MIN } },
        { engagementVelocity: { greater_than_equal: PROMOTION_ENGAGEMENT_VELOCITY_MIN } },
      ],
    },
  ],
}

/**
 * Builds the promotable-origins filter: SubFeed + User Feed items that pass the
 * safety exclusions AND at least one promotion branch (featured, organic
 * threshold, or curated discovery boost).
 */
export const buildPromotableOriginFilter = (options: PromotionWhereOptions = {}): Where => ({
  and: [
    { feed: { in: ['subfeed', 'user'] } },
    ...buildSafetyExclusions(options),
    {
      or: [
        { featured: { equals: true } },
        { discoveryBoosted: { equals: true } },
        thresholdGate,
      ],
    },
  ],
})

/**
 * Builds the full Main Feed `where` fragment: native main-feed content OR
 * promotable SubFeed/User Feed content. Drop-in replacement for the inline
 * `mainFeedFilter` previously defined in the Home page.
 */
export const buildMainFeedWhere = (options: PromotionWhereOptions = {}): Where => ({
  or: [{ feed: { equals: 'main' } }, buildPromotableOriginFilter(options)],
})

/** Structural subset of a Users doc needed to evaluate discovery standing. */
export interface DiscoveryStandingUserLike {
  roles?: (string | null)[] | null
  discoveryScore?: number | null
  lastActiveAt?: string | null
}

/**
 * Pure predicate: does this member hold curated-boost standing? Site
 * admin/moderator/editor always qualify; otherwise the member's discovery score
 * (recency-decayed, mirroring `deriveAutomaticRoles`) must meet
 * `DISCOVERY_BOOST_MIN_SCORE`.
 */
export const hasDiscoveryBoostStanding = (
  userLike: DiscoveryStandingUserLike | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (canModerateCommunity(userLike)) return true

  const discovery = readNum(userLike?.discoveryScore)
  const factor = recencyDecayFactor(userLike?.lastActiveAt, now)

  return discovery * factor >= DISCOVERY_BOOST_MIN_SCORE
}
