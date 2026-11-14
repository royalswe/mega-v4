import type { Payload, PayloadRequest } from 'payload'

import { TRUST_LEVEL_THRESHOLDS, buildTrustProfile, recencyDecayFactor } from './reputation'
import type { CommunityRole, RoleSignals, TrustLevel } from './reputation'
import { TRUST_DYNAMICS_ACTIVE_WINDOW_DAYS } from './trustDynamics'

/**
 * SubFeed creation is gated behind *earned* community standing rather than open
 * registration. SubFeeds compete with the Main Feed, so only members who have
 * proven themselves may create one — this keeps fresh throwaway accounts from
 * generating spam subfeeds.
 *
 * A member qualifies via any ONE of three paths:
 *
 *   1. Uploader candidacy — already holds the `uploader` role, meets its
 *      promotion gate, or is within `SUBFEED_CANDIDACY_FACTOR` of its point
 *      thresholds (a "near-miss" allowance for members on the cusp).
 *   2. Editor candidacy — the same idea for the `editor` role.
 *   3. Strong recruiter standing — `recruiterScore` at or above
 *      `SUBFEED_STRONG_RECRUITER_THRESHOLD` (meaningfully above the recruiter
 *      role gate of 40), or already holds the `recruiter` role.
 *
 * Site admins always qualify. A member whose standing is frozen
 * (`standingLocked`) never qualifies — a frozen standing cannot earn new
 * privileges. Likewise, a role revoked by an administrator (from ticket #15's
 * safety controls) blocks its corresponding candidacy path: if your `uploader`
 * role was revoked, you are not an uploader candidate, even if your raw
 * scores would still qualify.
 *
 * The uploader/editor point thresholds mirror the promotion gates in
 * `reputation.ts` (`canUploadPromote` / `canEditPromote`). They are duplicated
 * here as named constants so the UI and tests can reference them without
 * reaching into the role-derivation internals.
 */

/**
 * Community-standing path (Bobhund suggestion: creation should prove both
 * Contribution *and* Likability, not just role candidacy). A member qualifies
 * through this path when they clear both point floors and rank inside the top
 * decile of active members. The relative-rank test is only applied when the
 * caller supplies population context; pure unit tests keep the point floors.
 */
export const SUBFEED_COMMUNITY_CONTRIBUTION_MIN = 80
export const SUBFEED_LIKABILITY_MIN = 40
export const SUBFEED_RELATIVE_RANK_TOP_SHARE = 0.1

/** A member within this fraction of a role gate's point thresholds counts as a "candidate". */
export const SUBFEED_CANDIDACY_FACTOR = 0.7

/** The recruiter role gate (mirrors `canRecruitPromote` in reputation.ts). */
export const RECRUITER_ROLE_GATE = 40

/**
 * Recruiter score that qualifies as "strong recruiter standing". The recruiter
 * role gate sits at 40; requiring 60 (1.5×) means a member has demonstrated
 * sustained recruiting rather than a single burst, and is comfortably above the
 * automatic role threshold.
 */
export const SUBFEED_STRONG_RECRUITER_THRESHOLD = RECRUITER_ROLE_GATE * 1.5

// Uploader role gate (mirrors `canUploadPromote` in reputation.ts).
export const UPLOADER_CONTRIBUTION = 80
export const UPLOADER_DISCOVERY = 60
export const UPLOADER_CONTRIBUTION_SOLO = 120
export const UPLOADER_TRUST_GATE: TrustLevel = 'recognized'

// Editor role gate (mirrors `canEditPromote` in reputation.ts).
export const EDITOR_CONTRIBUTION = 180
export const EDITOR_INTERACTION = 60
export const EDITOR_CONTRIBUTION_SOLO = 280
export const EDITOR_TRUST_GATE: TrustLevel = 'trusted'

export type SubfeedRequirementKey =
  'uploader-candidacy' | 'editor-candidacy' | 'strong-recruiter' | 'community-standing'

export type SubfeedEligibilityReason =
  'admin' | 'uploader-candidacy' | 'editor-candidacy' | 'strong-recruiter' | 'community-standing'

export interface SubfeedEligibilityProgressItem {
  /** Stable machine-readable key (also used for tests). */
  requirement: SubfeedRequirementKey
  /** Human label. */
  label: string
  /** Human explanation of what this requirement needs. */
  detail: string
  /** Completion fraction 0..1 (clamped). */
  current: number
  /** Required completion fraction (always 1). */
  needed: number
  /** Whether the requirement is currently met. */
  met: boolean
}

export interface SubfeedEligibility {
  eligible: boolean
  /** True when the member's standing is frozen, which blocks eligibility entirely. */
  locked: boolean
  /** Which paths qualified the member (empty when ineligible). */
  reasons: SubfeedEligibilityReason[]
  /** Progress toward each requirement, for the UI gate. */
  progress: SubfeedEligibilityProgressItem[]
  /** Requirement keys the member has not yet met. */
  missing: SubfeedRequirementKey[]
  /** Decayed signal snapshot used for the evaluation (for richer UI rendering). */
  signals: {
    contribution: number
    discovery: number
    interaction: number
    recruiter: number
    likability: number
    /** Share of active members ranked ahead (0 = top); null when unknown. */
    relativeRank: number | null
  }
  trustLevel: TrustLevel
}

export interface SubfeedEligibilityInput {
  signals: RoleSignals
  roles?: CommunityRole[]
  /** Roles revoked by an administrator (ticket #15 safety controls). */
  revokedRoles?: CommunityRole[]
  trustLevel?: TrustLevel
  /** Frozen standing (mirrors the `standingLocked` field on Users). */
  standingLocked?: boolean
  /** Injectable clock for deterministic testing. */
  now?: Date
  /** Optional active-member distribution for the relative-rank test. */
  population?: {
    totalActiveMembers: number
    /** Number of active members whose standing is higher than this member's. */
    membersAhead: number
  }
}

/** Structural subset of the Users doc needed to evaluate eligibility. */
export interface SubfeedEligibilityUserLike {
  roles?: CommunityRole[] | null
  revokedRoles?: CommunityRole[] | null
  trustLevel?: TrustLevel | null
  standingLocked?: boolean | null
  contributionScore?: number | null
  discoveryScore?: number | null
  interactionScore?: number | null
  recruiterScore?: number | null
  likabilityScore?: number | null
  totalMemberValue?: number | null
  lastActiveAt?: string | null
}

const readNum = (value?: number | null): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

const fraction = (current: number, needed: number): number =>
  needed > 0 ? clamp01(current / needed) : current >= needed ? 1 : 0

const trustIndex = (level: TrustLevel): number =>
  TRUST_LEVEL_THRESHOLDS.findIndex((entry) => entry.value === level)

const trustAtLeast = (value: TrustLevel, threshold: TrustLevel): boolean =>
  trustIndex(value) >= trustIndex(threshold)

const rounded = (value: number): number => Math.round(value * 100) / 100

const whole = (value: number): number => Math.round(value)

export const evaluateSubfeedEligibility = (input: SubfeedEligibilityInput): SubfeedEligibility => {
  const {
    signals,
    trustLevel: providedTrustLevel,
    standingLocked = false,
    now = new Date(),
  } = input

  const roles = Array.isArray(input.roles) ? input.roles : ['user']
  const isAdmin = roles.includes('admin')

  const trustLevel = providedTrustLevel ?? buildTrustProfile(signals, { now }).trustLevel

  // Apply recency decay to the raw signals, matching how `deriveAutomaticRoles`
  // decays point classes before evaluating role gates.
  const factor = recencyDecayFactor(signals.lastActiveAt, now)
  const contribution = readNum(signals.contributionScore) * factor
  const discovery = readNum(signals.discoveryScore) * factor
  const interaction = readNum(signals.interactionScore) * factor
  const recruiter = readNum(signals.recruiterScore) * factor
  const likability = readNum(signals.likabilityScore) * factor

  const relativeRank =
    input.population && input.population.totalActiveMembers > 0
      ? clamp01(input.population.membersAhead / input.population.totalActiveMembers)
      : null

  // Admin-revoked roles block their corresponding candidacy path — a member
  // whose uploader role was revoked is not an uploader candidate, even with
  // qualifying raw scores.
  const revoked = new Set(Array.isArray(input.revokedRoles) ? input.revokedRoles : [])

  // Uploader candidacy.
  const holdsUploader = roles.includes('uploader')
  const uploaderTrustOk = trustAtLeast(trustLevel, UPLOADER_TRUST_GATE)
  const uploaderSolo = fraction(contribution, UPLOADER_CONTRIBUTION_SOLO * SUBFEED_CANDIDACY_FACTOR)
  const uploaderTrustedContribution = uploaderTrustOk
    ? fraction(contribution, UPLOADER_CONTRIBUTION * SUBFEED_CANDIDACY_FACTOR)
    : 0
  const uploaderTrustedDiscovery = uploaderTrustOk
    ? fraction(discovery, UPLOADER_DISCOVERY * SUBFEED_CANDIDACY_FACTOR)
    : 0
  const uploaderProgress = Math.max(
    uploaderSolo,
    uploaderTrustedContribution,
    uploaderTrustedDiscovery,
  )
  const uploaderCandidate = !revoked.has('uploader') && (holdsUploader || uploaderProgress >= 1)

  // Editor candidacy.
  const holdsEditor = roles.includes('editor')
  const editorTrustOk = trustAtLeast(trustLevel, EDITOR_TRUST_GATE)
  const editorSolo = fraction(contribution, EDITOR_CONTRIBUTION_SOLO * SUBFEED_CANDIDACY_FACTOR)
  const editorTrusted = editorTrustOk
    ? Math.min(
        fraction(contribution, EDITOR_CONTRIBUTION * SUBFEED_CANDIDACY_FACTOR),
        fraction(interaction, EDITOR_INTERACTION * SUBFEED_CANDIDACY_FACTOR),
      )
    : 0
  const editorProgress = Math.max(editorSolo, editorTrusted)
  const editorCandidate = !revoked.has('editor') && (holdsEditor || editorProgress >= 1)

  // Strong recruiter standing.
  const holdsRecruiter = roles.includes('recruiter')
  const recruiterProgress = fraction(recruiter, SUBFEED_STRONG_RECRUITER_THRESHOLD)
  const strongRecruiter =
    !revoked.has('recruiter') && (holdsRecruiter || recruiter >= SUBFEED_STRONG_RECRUITER_THRESHOLD)

  // Community standing: high Contribution *and* Likability, optionally gated
  // by relative rank when population context is available.
  const communityContributionOk = contribution >= SUBFEED_COMMUNITY_CONTRIBUTION_MIN
  const communityLikabilityOk = likability >= SUBFEED_LIKABILITY_MIN
  const relativeRankOk = relativeRank === null || relativeRank <= SUBFEED_RELATIVE_RANK_TOP_SHARE
  const communityStanding = communityContributionOk && communityLikabilityOk && relativeRankOk

  const reasons: SubfeedEligibilityReason[] = []
  if (isAdmin) reasons.push('admin')
  if (uploaderCandidate) reasons.push('uploader-candidacy')
  if (editorCandidate) reasons.push('editor-candidacy')
  if (strongRecruiter) reasons.push('strong-recruiter')
  if (communityStanding) reasons.push('community-standing')

  const locked = !isAdmin && standingLocked
  const eligible = !locked && reasons.length > 0

  const progress: SubfeedEligibilityProgressItem[] = [
    {
      requirement: 'uploader-candidacy',
      label: 'Uploader candidacy',
      detail: `Reach Uploader candidacy: ${whole(UPLOADER_CONTRIBUTION_SOLO * SUBFEED_CANDIDACY_FACTOR)}+ Contribution Points, or ${whole(UPLOADER_CONTRIBUTION * SUBFEED_CANDIDACY_FACTOR)}+ Contribution / ${whole(UPLOADER_DISCOVERY * SUBFEED_CANDIDACY_FACTOR)}+ Discovery Points with Recognized standing.`,
      current: rounded(uploaderProgress),
      needed: 1,
      met: uploaderCandidate,
    },
    {
      requirement: 'editor-candidacy',
      label: 'Editor candidacy',
      detail: `Reach Editor candidacy: ${whole(EDITOR_CONTRIBUTION_SOLO * SUBFEED_CANDIDACY_FACTOR)}+ Contribution Points, or ${whole(EDITOR_CONTRIBUTION * SUBFEED_CANDIDACY_FACTOR)}+ Contribution and ${whole(EDITOR_INTERACTION * SUBFEED_CANDIDACY_FACTOR)}+ Interaction Points with Trusted standing.`,
      current: rounded(editorProgress),
      needed: 1,
      met: editorCandidate,
    },
    {
      requirement: 'strong-recruiter',
      label: 'Strong Recruiter standing',
      detail: `Earn strong Recruiter standing: ${SUBFEED_STRONG_RECRUITER_THRESHOLD}+ Recruiter Points (you have ${Math.round(recruiter)}).`,
      current: rounded(recruiterProgress),
      needed: 1,
      met: strongRecruiter,
    },
    {
      requirement: 'community-standing',
      label: 'Community standing',
      detail: `Earn ${SUBFEED_COMMUNITY_CONTRIBUTION_MIN}+ Contribution and ${SUBFEED_LIKABILITY_MIN}+ Likability Points${
        relativeRank === null
          ? ''
          : `, and rank in the top ${whole(SUBFEED_RELATIVE_RANK_TOP_SHARE * 100)}% of active members`
      }.`,
      current: rounded(
        Math.min(
          fraction(contribution, SUBFEED_COMMUNITY_CONTRIBUTION_MIN),
          fraction(likability, SUBFEED_LIKABILITY_MIN),
          relativeRank === null
            ? 1
            : fraction(SUBFEED_RELATIVE_RANK_TOP_SHARE, Math.max(relativeRank, 0.0001)),
        ),
      ),
      needed: 1,
      met: communityStanding,
    },
  ]

  const missing = progress.filter((item) => !item.met).map((item) => item.requirement)

  return {
    eligible,
    locked,
    reasons,
    progress,
    missing,
    signals: {
      contribution: Math.round(contribution),
      discovery: Math.round(discovery),
      interaction: Math.round(interaction),
      recruiter: Math.round(recruiter),
      likability: Math.round(likability),
      relativeRank: relativeRank === null ? null : rounded(relativeRank),
    },
    trustLevel,
  }
}

/** Maps a Users doc to a full eligibility result. */
export const readUserEligibility = (
  user: SubfeedEligibilityUserLike,
  now?: Date,
  population?: SubfeedEligibilityInput['population'],
): SubfeedEligibility =>
  evaluateSubfeedEligibility({
    signals: {
      contributionScore: user.contributionScore ?? undefined,
      discoveryScore: user.discoveryScore ?? undefined,
      interactionScore: user.interactionScore ?? undefined,
      recruiterScore: user.recruiterScore ?? undefined,
      likabilityScore: user.likabilityScore ?? undefined,
      lastActiveAt: user.lastActiveAt ?? undefined,
    },
    roles: user.roles ?? undefined,
    revokedRoles: user.revokedRoles ?? undefined,
    trustLevel: user.trustLevel ?? undefined,
    standingLocked: user.standingLocked ?? false,
    population,
    now,
  })

/**
 * Loads a user's profile and evaluates their SubFeed creation eligibility.
 * Reads with `overrideAccess: true` so the acting user's own standing fields
 * (roles, trust level, scores, `standingLocked`) can be read for gating.
 */
export const getSubfeedEligibilityForUser = async (
  payload: Payload,
  userId: number,
  req?: PayloadRequest,
): Promise<SubfeedEligibility | null> => {
  const reqScope = req ? { req } : {}
  const profile = await payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
    ...reqScope,
  })

  if (!profile) return null

  // Population context for the relative-rank path. Counts are cheap (indexed)
  // and this only runs on the SubFeed creation page/action.
  const activeSince = new Date(
    Date.now() - TRUST_DYNAMICS_ACTIVE_WINDOW_DAYS * 86_400_000,
  ).toISOString()
  const standing = profile.totalMemberValue ?? 0

  const [totalActive, membersAhead] = await Promise.all([
    payload.count({
      collection: 'users',
      where: { lastActiveAt: { greater_than: activeSince } },
      overrideAccess: true,
      ...reqScope,
    }),
    payload.count({
      collection: 'users',
      where: {
        and: [
          { lastActiveAt: { greater_than: activeSince } },
          { totalMemberValue: { greater_than: standing } },
        ],
      },
      overrideAccess: true,
      ...reqScope,
    }),
  ])

  return readUserEligibility(profile as unknown as SubfeedEligibilityUserLike, undefined, {
    totalActiveMembers: totalActive.totalDocs,
    membersAhead: membersAhead.totalDocs,
  })
}

export const SUBFEED_CREATION_LOCKED_MESSAGE =
  'Your community standing is frozen, so SubFeed creation is unavailable right now. Contact a moderator if you believe this is a mistake.'

export const SUBFEED_CREATION_INELIGIBLE_MESSAGE =
  'You need more community standing to create a SubFeed yet. SubFeeds are exclusive — earn Uploader candidacy, Editor candidacy, strong Recruiter standing, or high Contribution and Likability standing to unlock creation. Keep contributing and inviting members; your own User Feed is always open.'

/** Builds the informative error message for a rejected creation attempt. */
export const buildSubfeedEligibilityMessage = (result: SubfeedEligibility): string =>
  result.locked ? SUBFEED_CREATION_LOCKED_MESSAGE : SUBFEED_CREATION_INELIGIBLE_MESSAGE

/**
 * Asserts the acting user may create a SubFeed, throwing an informative error
 * when they may not. Used by the `createSubfeed` server action; extracted so
 * the guard is unit/integration-testable without invoking the action (which
 * depends on the Next.js `headers()` request scope).
 */
export const assertSubfeedCreationEligible = async (
  payload: Payload,
  userId: number,
  req?: PayloadRequest,
): Promise<SubfeedEligibility> => {
  const eligibility = await getSubfeedEligibilityForUser(payload, userId, req)

  if (!eligibility || !eligibility.eligible) {
    throw new Error(
      eligibility
        ? buildSubfeedEligibilityMessage(eligibility)
        : 'You must be logged in to create a subfeed',
    )
  }

  return eligibility
}
