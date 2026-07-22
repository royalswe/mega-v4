export type TrustLevel =
  'newcomer' | 'regular' | 'recognized' | 'trusted' | 'veteran' | 'curator' | 'pillar' | 'legend'

export const TRUST_LEVEL_THRESHOLDS: Array<{ min: number; value: TrustLevel; label: string }> = [
  { min: 0, value: 'newcomer', label: 'Newcomer' },
  { min: 40, value: 'regular', label: 'Regular' },
  { min: 120, value: 'recognized', label: 'Recognized' },
  { min: 280, value: 'trusted', label: 'Trusted' },
  { min: 520, value: 'veteran', label: 'Veteran' },
  { min: 900, value: 'curator', label: 'Curator' },
  { min: 1400, value: 'pillar', label: 'Pillar' },
  { min: 2100, value: 'legend', label: 'Legend' },
]

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

export interface TrustProfile {
  reputationHidden: number
  trustLevel: TrustLevel
  reputationPublicLabel: string
}

export type CommunityRole =
  'admin' | 'editor' | 'moderator' | 'cleaner' | 'uploader' | 'recruiter' | 'user'

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

const calculateHiddenReputation = (signals: ReputationSignals): number => {
  return buildPointClassProfile(signals).totalMemberValue
}

const getTrustFromReputation = (score: number): TrustProfile => {
  const safeScore = clamp(score)

  let selected = TRUST_LEVEL_THRESHOLDS[0]
  for (const level of TRUST_LEVEL_THRESHOLDS) {
    if (safeScore >= level.min) selected = level
  }

  return {
    reputationHidden: safeScore,
    trustLevel: selected.value,
    reputationPublicLabel: selected.label,
  }
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

const daysSince = (lastActiveAt?: string | Date | null): number | null => {
  if (!lastActiveAt) return null

  const lastActive = new Date(lastActiveAt)
  if (Number.isNaN(lastActive.getTime())) return null

  return Math.max(0, (Date.now() - lastActive.getTime()) / 86_400_000)
}

const hasRecentActivity = (lastActiveAt?: string | Date | null): boolean => {
  const inactivityDays = daysSince(lastActiveAt)
  return inactivityDays === null ? true : inactivityDays <= 30
}

const isAtLeast = (value: TrustLevel, threshold: TrustLevel): boolean => {
  return (
    TRUST_LEVEL_THRESHOLDS.findIndex((level) => level.value === value) >=
    TRUST_LEVEL_THRESHOLDS.findIndex((level) => level.value === threshold)
  )
}

const normalizeRoles = (roles: CommunityRole[]): CommunityRole[] => {
  return Array.from(new Set(roles))
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
): CommunityRole[] => {
  const pointProfile = buildPointClassProfile(signals)
  const trust = buildTrustProfile(signals)
  const nextRoles: CommunityRole[] = ['user']
  const preserveAdmin = existingRoles.includes('admin')

  if (preserveAdmin) {
    nextRoles.unshift('admin')
  }

  if (!hasRecentActivity(signals.lastActiveAt)) {
    return normalizeRoles(nextRoles)
  }

  const discovery = pointProfile.discoveryPoints
  const contribution = pointProfile.contributionPoints
  const interaction = pointProfile.interactionPoints
  const cleaning = pointProfile.cleaningPoints
  const recruiter = pointProfile.recruiterPoints
  const security = pointProfile.securityPoints

  const canUpload =
    (isAtLeast(trust.trustLevel, 'recognized') && (contribution >= 80 || discovery >= 60)) ||
    contribution >= 120
  const canEdit =
    (isAtLeast(trust.trustLevel, 'trusted') && contribution >= 180 && interaction >= 60) ||
    contribution >= 280
  const canModerate =
    (isAtLeast(trust.trustLevel, 'curator') && cleaning >= 40 && security >= 25) || cleaning >= 80
  const canClean = cleaning >= 40 || (isAtLeast(trust.trustLevel, 'trusted') && cleaning >= 20)
  const canRecruit =
    recruiter >= 40 || (isAtLeast(trust.trustLevel, 'recognized') && contribution >= 120)

  if (canUpload) nextRoles.push('uploader')
  if (canEdit) nextRoles.push('editor')
  if (canModerate) nextRoles.push('moderator')
  if (canClean) nextRoles.push('cleaner')
  if (canRecruit) nextRoles.push('recruiter')

  return normalizeRoles(nextRoles)
}

export const buildTrustProfile = (signals: ReputationSignals): TrustProfile => {
  const hidden = calculateHiddenReputation(signals)
  return getTrustFromReputation(hidden)
}
