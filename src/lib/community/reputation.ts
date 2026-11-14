export type TrustLevel =
  'newcomer' | 'regular' | 'recognized' | 'trusted' | 'veteran' | 'curator' | 'pillar' | 'legend'

export interface TrustThreshold {
  min: number
  value: TrustLevel
  label: string
}

/**
 * Base trust ladder.
 *
 * Derivation (Bobhund suggestion: "what do 40 / 120 / 280 mean?"):
 *
 *   - `COLD_START_FLOOR` (40) is the minimum effective standing granted to an
 *     active member with any genuine activity, so `regular` must sit exactly at
 *     that floor — otherwise the floor would grant no level at all.
 *   - Each subsequent band grows by roughly 2.2–2.5× (`40 → 120 → 280 → 520 →
 *     900 → 1400 → 2100`). That ratio was chosen so a consistently active member
 *     (a few quality contributions or votes per day) advances one band every
 *     few weeks, while a burst-only account cannot skip a band. The bands are
 *     geometric rather than linear because engagement opportunity grows with
 *     reach: higher bands require *sustained* activity, not just more clicks.
 *   - These are **base** values. On a live community the effective thresholds
 *     are scaled per level by `trustDynamics.ts` from the observed population
 *     distribution (exponential moving average), so a level that becomes too
 *     crowded automatically becomes harder to reach and relaxes again as
 *     members go inactive.
 */
export const TRUST_LEVEL_THRESHOLDS: TrustThreshold[] = [
  { min: 0, value: 'newcomer', label: 'Newcomer' },
  { min: 40, value: 'regular', label: 'Regular' },
  { min: 120, value: 'recognized', label: 'Recognized' },
  { min: 280, value: 'trusted', label: 'Trusted' },
  { min: 520, value: 'veteran', label: 'Veteran' },
  { min: 900, value: 'curator', label: 'Curator' },
  { min: 1400, value: 'pillar', label: 'Pillar' },
  { min: 2100, value: 'legend', label: 'Legend' },
]

/**
 * Recency decay constants (exported so tests can reason about them).
 *
 * `RECENCY_HALF_LIFE_DAYS` — number of inactivity days it takes for a member's
 * accumulated standing to halve. Shorter = faster cool-down.
 *
 * `COLD_START_FLOOR` — the minimum effective standing score granted to an active
 * member who has any genuine activity. Kept modest (the `regular` threshold) so
 * fresh accounts can establish initial standing but cannot farm higher levels.
 *
 * `COLD_START_ACTIVE_DAYS` — the inactivity window within which a member is still
 * considered "active" for the purpose of the cold-start floor.
 */
export const RECENCY_HALF_LIFE_DAYS = 45
export const COLD_START_FLOOR = 40
export const COLD_START_ACTIVE_DAYS = 30

/**
 * Hysteresis margins for trust-level transitions.
 *
 * A promotion to a higher level requires the score to clear the target threshold
 * by `HYSTERESIS_PROMOTE_MARGIN`. A demotion only happens once the score falls
 * `HYSTERESIS_DEMOTE_MARGIN` below the *current* level's threshold. The band
 * between these two thresholds prevents thrashing near boundaries.
 */
export const HYSTERESIS_PROMOTE_MARGIN = 8
export const HYSTERESIS_DEMOTE_MARGIN = 12

/**
 * Fraction of the promotion point-thresholds that a member must retain in order
 * to keep an already-earned automatic role. Applied together with a one-level
 * relaxation of the trust gate, this gives role transitions their own hysteresis.
 */
export const ROLE_RETENTION_FACTOR = 0.75

export interface PointClassSignals {
  discoveryScore?: number
  contributionScore?: number
  interactionScore?: number
  likabilityScore?: number
  cleaningScore?: number
  recruiterScore?: number
  moderationScore?: number
  legacyContributionScore?: number
  securityScore?: number
}

export type ReputationSignals = PointClassSignals

export interface TrustSignals extends ReputationSignals {
  lastActiveAt?: string | Date | null
}

export interface TrustProfile {
  reputationHidden: number
  trustLevel: TrustLevel
  reputationPublicLabel: string
}

export type CommunityRole =
  'admin' | 'editor' | 'moderator' | 'cleaner' | 'uploader' | 'recruiter' | 'user'

/** Roles that are earned automatically (excludes the base `user` and manual `admin`). */
export const AUTOMATIC_ROLES: Array<Exclude<CommunityRole, 'admin' | 'user'>> = [
  'uploader',
  'editor',
  'moderator',
  'cleaner',
  'recruiter',
]

export interface PointClassProfile {
  interactionPoints: number
  likabilityPoints: number
  contributionPoints: number
  legacyContributionPoints: number
  cleaningPoints: number
  discoveryPoints: number
  recruiterPoints: number
  securityPoints: number
  totalMemberValue: number
}

export interface EffectiveScore {
  /** Raw (undecayed) weighted member value. */
  raw: number
  /** Recency factor applied to the raw score (0..1). */
  factor: number
  /** Raw score after recency decay (before floor). */
  decayed: number
  /** Final effective score (decayed + cold-start floor), rounded. */
  effective: number
  /** Whether the member is still within the cold-start active window. */
  recentlyActive: boolean
  /** Whether the cold-start floor was applied. */
  floored: boolean
}

const TITLE_POOL = [
  'Night Owl',
  'Archivist',
  'Deep Diver',
  'Trend Hunter',
  'Chaos Engine',
  'Reply Guy',
  'Meme Priest',
  'Signal Booster',
]

const unique = <T>(values: T[]): T[] => Array.from(new Set(values))

const clamp = (value: number, min = 0, max = 999_999): number => {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}

const readPoint = (value?: number): number => value ?? 0

export const buildPointClassProfile = (signals: PointClassSignals): PointClassProfile => {
  const discoveryPoints = readPoint(signals.discoveryScore)
  const contributionPoints = readPoint(signals.contributionScore)
  const interactionPoints = readPoint(signals.interactionScore)
  const likabilityPoints = readPoint(signals.likabilityScore)
  const cleaningPoints = readPoint(signals.cleaningScore ?? signals.moderationScore)
  const recruiterPoints = readPoint(signals.recruiterScore)
  const legacyContributionPoints = readPoint(signals.legacyContributionScore)
  const securityPoints = readPoint(signals.securityScore)

  const weighted =
    discoveryPoints * 1.6 +
    contributionPoints * 1.35 +
    likabilityPoints * 1.25 +
    interactionPoints * 0.85 +
    cleaningPoints * 0.55 +
    recruiterPoints * 0.9 +
    legacyContributionPoints * 0.35 +
    securityPoints * 0.4

  return {
    interactionPoints,
    likabilityPoints,
    contributionPoints,
    legacyContributionPoints,
    cleaningPoints,
    discoveryPoints,
    recruiterPoints,
    securityPoints,
    totalMemberValue: clamp(Math.round(weighted)),
  }
}

/** Returns a copy of the profile with every point class scaled by `factor`. */
const scaleProfile = (profile: PointClassProfile, factor: number): PointClassProfile => ({
  interactionPoints: profile.interactionPoints * factor,
  likabilityPoints: profile.likabilityPoints * factor,
  contributionPoints: profile.contributionPoints * factor,
  legacyContributionPoints: profile.legacyContributionPoints * factor,
  cleaningPoints: profile.cleaningPoints * factor,
  discoveryPoints: profile.discoveryPoints * factor,
  recruiterPoints: profile.recruiterPoints * factor,
  securityPoints: profile.securityPoints * factor,
  totalMemberValue: clamp(Math.round(profile.totalMemberValue * factor)),
})

/** Whole (fractional) days elapsed since `lastActiveAt` (or `null` if unknown). */
export const daysSince = (
  lastActiveAt?: string | Date | null,
  now: Date = new Date(),
): number | null => {
  if (!lastActiveAt) return null

  const lastActive = new Date(lastActiveAt)
  if (Number.isNaN(lastActive.getTime())) return null

  return Math.max(0, (now.getTime() - lastActive.getTime()) / 86_400_000)
}

/** Exponential recency factor in (0, 1] based on inactivity duration. */
export const recencyDecayFactor = (
  lastActiveAt?: string | Date | null,
  now: Date = new Date(),
): number => {
  const days = daysSince(lastActiveAt, now)
  if (days === null || days <= 0) return 1
  return Math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS)
}

/**
 * Computes the effective standing score from a raw weighted member value,
 * applying gradual recency decay and the cold-start floor.
 */
export const calculateEffectiveScore = (
  rawScore: number,
  lastActiveAt?: string | Date | null,
  now: Date = new Date(),
  coldStartFloor: number = COLD_START_FLOOR,
): EffectiveScore => {
  const raw = clamp(rawScore)
  const factor = recencyDecayFactor(lastActiveAt, now)
  const decayed = raw * factor
  const days = daysSince(lastActiveAt, now)
  const recentlyActive = days === null || days <= COLD_START_ACTIVE_DAYS

  let effectiveRaw = decayed
  let floored = false

  if (raw > 0 && recentlyActive) {
    const flooredRaw = Math.max(decayed, coldStartFloor)
    if (flooredRaw > decayed) {
      effectiveRaw = flooredRaw
      floored = true
    }
  }

  return {
    raw,
    factor,
    decayed,
    effective: Math.round(effectiveRaw),
    recentlyActive,
    floored,
  }
}

const trustIndex = (level: TrustLevel): number =>
  TRUST_LEVEL_THRESHOLDS.findIndex((entry) => entry.value === level)

const trustFromScore = (
  score: number,
  thresholds: TrustThreshold[] = TRUST_LEVEL_THRESHOLDS,
): TrustLevel => {
  const safeScore = clamp(score)
  let selected = thresholds[0]
  for (const level of thresholds) {
    if (safeScore >= level.min) selected = level
  }
  return selected.value
}

const trustLabel = (level: TrustLevel): string =>
  TRUST_LEVEL_THRESHOLDS.find((entry) => entry.value === level)?.label ??
  TRUST_LEVEL_THRESHOLDS[0].label

/**
 * Resolves a trust level from an effective score, applying hysteresis against a
 * previous level so members near threshold boundaries do not thrash.
 *
 * - Promotion to a higher level requires clearing the target threshold by
 *   `HYSTERESIS_PROMOTE_MARGIN`.
 * - Demotion requires falling `HYSTERESIS_DEMOTE_MARGIN` below the current
 *   level's threshold.
 * - Promotions out of the unestablished `newcomer` baseline are exempt so the
 *   cold-start floor (and any first large jump) can establish initial standing.
 */
export const resolveTrustLevel = (
  score: number,
  previous?: TrustLevel,
  thresholds: TrustThreshold[] = TRUST_LEVEL_THRESHOLDS,
): TrustLevel => {
  const safe = clamp(score)
  const raw = trustFromScore(safe, thresholds)

  if (!previous) return raw

  const prevIdx = trustIndex(previous)
  const rawIdx = trustIndex(raw)

  if (rawIdx === prevIdx) return raw

  if (rawIdx > prevIdx) {
    // Promotion — require margin above the target threshold, except cold-start.
    const isColdStart = prevIdx === 0
    if (isColdStart) return raw
    for (let index = rawIdx; index > prevIdx; index -= 1) {
      if (safe >= thresholds[index].min + HYSTERESIS_PROMOTE_MARGIN) {
        return thresholds[index].value
      }
    }
    return previous
  }

  // Demotion — require falling below the current threshold by the demote margin.
  const currentMin = thresholds[prevIdx].min
  if (safe < currentMin - HYSTERESIS_DEMOTE_MARGIN) return raw
  return previous
}

export interface TrustProfileOptions {
  /** Injectable clock (defaults to `new Date()`). */
  now?: Date
  /** Previous trust level, used for transition hysteresis. */
  previousTrustLevel?: TrustLevel
  /** Effective ladder (base thresholds, or a population-scaled snapshot). */
  thresholds?: TrustThreshold[]
  /** Cold-start floor; defaults to the base `COLD_START_FLOOR`. */
  coldStartFloor?: number
}

export const buildTrustProfile = (
  signals: TrustSignals,
  options: TrustProfileOptions = {},
): TrustProfile => {
  const { now = new Date(), previousTrustLevel, thresholds = TRUST_LEVEL_THRESHOLDS } = options
  const coldStartFloor =
    options.coldStartFloor ??
    Math.max(
      0,
      Math.round(
        (COLD_START_FLOOR * (thresholds[1]?.min ?? TRUST_LEVEL_THRESHOLDS[1].min)) /
          TRUST_LEVEL_THRESHOLDS[1].min,
      ),
    )
  const raw = buildPointClassProfile(signals).totalMemberValue
  const { effective } = calculateEffectiveScore(raw, signals.lastActiveAt, now, coldStartFloor)
  const trustLevel = resolveTrustLevel(effective, previousTrustLevel, thresholds)

  return {
    reputationHidden: effective,
    trustLevel,
    reputationPublicLabel: trustLabel(trustLevel),
  }
}

/**
 * Where a member sits on the trust ladder, in the shape a read surface needs.
 *
 * The profile page used to compute this inline in JSX (find the level, find the
 * next one, derive the span, clamp the ratio, subtract for the remainder), which
 * meant the only way to test it was a browser journey. Keeping it here makes the
 * ladder a value that callers and tests both consume.
 */
export interface TrustProgression {
  /** The level the member currently holds. */
  current: TrustThreshold
  /** The level above it, or `null` at the top of the ladder. */
  next: TrustThreshold | null
  /** Fraction of the way from `current` to `next`, clamped to 0–1. */
  progress: number
  /** Effective standing still needed for `next`; `0` at the top level. */
  remaining: number
  /** True when the member has reached the highest level. */
  isMaxLevel: boolean
}

export const buildTrustProgression = (
  totalMemberValue: number,
  trustLevel?: TrustLevel | null,
  thresholds: TrustThreshold[] = TRUST_LEVEL_THRESHOLDS,
): TrustProgression => {
  const standing = Number.isFinite(totalMemberValue) ? Math.max(0, totalMemberValue) : 0
  const resolvedLevel = trustLevel ?? resolveTrustLevel(standing, undefined, thresholds)

  const foundIndex = thresholds.findIndex((entry) => entry.value === resolvedLevel)
  const currentIndex = foundIndex >= 0 ? foundIndex : 0
  const current = thresholds[currentIndex] ?? TRUST_LEVEL_THRESHOLDS[0]
  const next = thresholds[currentIndex + 1] ?? null

  if (!next) {
    return { current, next: null, progress: 1, remaining: 0, isMaxLevel: true }
  }

  const span = next.min - current.min
  const progress = span > 0 ? clamp((standing - current.min) / span, 0, 1) : 1
  const remaining = Math.max(0, next.min - standing)

  return { current, next, progress, remaining, isMaxLevel: false }
}

export interface TitleSignals {
  discoveryScore?: number
  contributionScore?: number
  interactionScore?: number
  moderationScore?: number
  streakDays?: number
  lastActiveAt?: string | Date | null
}

export interface RoleSignals extends ReputationSignals {
  streakDays?: number
  lastActiveAt?: string | Date | null
}

export interface DeriveRolesOptions {
  /** Injectable clock (defaults to `new Date()`). */
  now?: Date
  /** Previous trust level, used for trust hysteresis inside role predicates. */
  previousTrustLevel?: TrustLevel
  /** When true, automatic derivation is frozen and existing roles are kept. */
  rolesLocked?: boolean
  /** Roles explicitly revoked by an admin; never re-granted automatically. */
  revokedRoles?: CommunityRole[]
  /** Effective ladder (base thresholds, or a population-scaled snapshot). */
  thresholds?: TrustThreshold[]
}

const normalizeRoles = (roles: CommunityRole[]): CommunityRole[] => {
  return Array.from(new Set(roles))
}

const isAtLeast = (value: TrustLevel, threshold: TrustLevel): boolean => {
  return trustIndex(value) >= trustIndex(threshold)
}

/** Relaxes a trust gate by one level, used for role retention. */
const relaxTrust = (threshold: TrustLevel): TrustLevel => {
  const idx = trustIndex(threshold)
  return idx > 0 ? TRUST_LEVEL_THRESHOLDS[idx - 1].value : threshold
}

interface RoleContext {
  trustLevel: TrustLevel
  contribution: number
  discovery: number
  interaction: number
  cleaning: number
  recruiter: number
  security: number
}

const canUploadPromote = (ctx: RoleContext): boolean =>
  (isAtLeast(ctx.trustLevel, 'recognized') && (ctx.contribution >= 80 || ctx.discovery >= 60)) ||
  ctx.contribution >= 120

const canUploadRetain = (ctx: RoleContext): boolean =>
  (isAtLeast(ctx.trustLevel, relaxTrust('recognized')) &&
    (ctx.contribution >= 80 * ROLE_RETENTION_FACTOR ||
      ctx.discovery >= 60 * ROLE_RETENTION_FACTOR)) ||
  ctx.contribution >= 120 * ROLE_RETENTION_FACTOR

const canEditPromote = (ctx: RoleContext): boolean =>
  (isAtLeast(ctx.trustLevel, 'trusted') && ctx.contribution >= 180 && ctx.interaction >= 60) ||
  ctx.contribution >= 280

const canEditRetain = (ctx: RoleContext): boolean =>
  (isAtLeast(ctx.trustLevel, relaxTrust('trusted')) &&
    ctx.contribution >= 180 * ROLE_RETENTION_FACTOR &&
    ctx.interaction >= 60 * ROLE_RETENTION_FACTOR) ||
  ctx.contribution >= 280 * ROLE_RETENTION_FACTOR

const canModeratePromote = (ctx: RoleContext): boolean =>
  (isAtLeast(ctx.trustLevel, 'curator') && ctx.cleaning >= 40 && ctx.security >= 25) ||
  ctx.cleaning >= 80

const canModerateRetain = (ctx: RoleContext): boolean =>
  (isAtLeast(ctx.trustLevel, relaxTrust('curator')) &&
    ctx.cleaning >= 40 * ROLE_RETENTION_FACTOR &&
    ctx.security >= 25 * ROLE_RETENTION_FACTOR) ||
  ctx.cleaning >= 80 * ROLE_RETENTION_FACTOR

const canCleanPromote = (ctx: RoleContext): boolean =>
  ctx.cleaning >= 40 || (isAtLeast(ctx.trustLevel, 'trusted') && ctx.cleaning >= 20)

const canCleanRetain = (ctx: RoleContext): boolean =>
  ctx.cleaning >= 40 * ROLE_RETENTION_FACTOR ||
  (isAtLeast(ctx.trustLevel, relaxTrust('trusted')) && ctx.cleaning >= 20 * ROLE_RETENTION_FACTOR)

const canRecruitPromote = (ctx: RoleContext): boolean =>
  ctx.recruiter >= 40 || (isAtLeast(ctx.trustLevel, 'recognized') && ctx.contribution >= 120)

const canRecruitRetain = (ctx: RoleContext): boolean =>
  ctx.recruiter >= 40 * ROLE_RETENTION_FACTOR ||
  (isAtLeast(ctx.trustLevel, relaxTrust('recognized')) &&
    ctx.contribution >= 120 * ROLE_RETENTION_FACTOR)

const automaticRolePredicates: Record<
  Exclude<CommunityRole, 'admin' | 'user'>,
  { promote: (ctx: RoleContext) => boolean; retain: (ctx: RoleContext) => boolean }
> = {
  uploader: { promote: canUploadPromote, retain: canUploadRetain },
  editor: { promote: canEditPromote, retain: canEditRetain },
  moderator: { promote: canModeratePromote, retain: canModerateRetain },
  cleaner: { promote: canCleanPromote, retain: canCleanRetain },
  recruiter: { promote: canRecruitPromote, retain: canRecruitRetain },
}

export const deriveBehavioralTitles = (signals: TitleSignals): string[] => {
  const titles: string[] = []

  const discovery = signals.discoveryScore ?? 0
  const contribution = signals.contributionScore ?? 0
  const interaction = signals.interactionScore ?? 0
  const moderation = signals.moderationScore ?? 0
  const streak = signals.streakDays ?? 0

  if (discovery >= 80) titles.push('Trend Hunter')
  if (discovery >= 180) titles.push('Signal Booster')
  if (contribution >= 90) titles.push('Archivist')
  if (contribution >= 200) titles.push('Deep Diver')
  if (interaction >= 120) titles.push('Reply Guy')
  if (interaction >= 220) titles.push('Chaos Engine')
  if (moderation >= 40) titles.push('Meme Priest')
  if (streak >= 10) titles.push('Night Owl')

  if (titles.length === 0) {
    titles.push(
      TITLE_POOL[(Math.abs(discovery + contribution + interaction) + streak) % TITLE_POOL.length],
    )
  }

  return unique(titles).slice(0, 3)
}

export const deriveAutomaticRoles = (
  signals: RoleSignals,
  existingRoles: CommunityRole[] = [],
  options: DeriveRolesOptions = {},
): CommunityRole[] => {
  const {
    now = new Date(),
    previousTrustLevel,
    rolesLocked = false,
    revokedRoles = [],
    thresholds = TRUST_LEVEL_THRESHOLDS,
  } = options

  const revoked = new Set(revokedRoles)
  const preserveAdmin = existingRoles.includes('admin')

  const baseRoles: CommunityRole[] = preserveAdmin ? ['admin', 'user'] : ['user']

  if (rolesLocked) {
    // Frozen: keep whatever roles the member already holds (minus revoked).
    const frozen = normalizeRoles([...existingRoles])
    const withoutRevoked = frozen.filter((role) => !revoked.has(role))
    if (!withoutRevoked.includes('user')) withoutRevoked.push('user')
    return normalizeRoles(withoutRevoked)
  }

  const rawProfile = buildPointClassProfile(signals)
  const factor = recencyDecayFactor(signals.lastActiveAt, now)
  const decayedProfile = scaleProfile(rawProfile, factor)
  const trust = buildTrustProfile(signals, { now, previousTrustLevel, thresholds })

  const ctx: RoleContext = {
    trustLevel: trust.trustLevel,
    contribution: decayedProfile.contributionPoints,
    discovery: decayedProfile.discoveryPoints,
    interaction: decayedProfile.interactionPoints,
    cleaning: decayedProfile.cleaningPoints,
    recruiter: decayedProfile.recruiterPoints,
    security: decayedProfile.securityPoints,
  }

  const nextRoles: CommunityRole[] = [...baseRoles]

  for (const role of AUTOMATIC_ROLES) {
    const predicates = automaticRolePredicates[role]
    const alreadyHas = existingRoles.includes(role)
    if (predicates.promote(ctx) || (alreadyHas && predicates.retain(ctx))) {
      nextRoles.push(role)
    }
  }

  return normalizeRoles(nextRoles.filter((role) => !revoked.has(role)))
}
