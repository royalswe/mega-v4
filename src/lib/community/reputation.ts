export type TrustLevel =
  | 'newcomer'
  | 'regular'
  | 'recognized'
  | 'trusted'
  | 'veteran'
  | 'curator'
  | 'pillar'
  | 'legend'

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

export interface ReputationSignals {
  discoveryScore?: number
  contributionScore?: number
  interactionScore?: number
  moderationScore?: number
  legacyContributionScore?: number
  securityScore?: number
}

export interface TrustProfile {
  reputationHidden: number
  trustLevel: TrustLevel
  reputationPublicLabel: string
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

export const calculateHiddenReputation = (signals: ReputationSignals): number => {
  const discovery = signals.discoveryScore ?? 0
  const contribution = signals.contributionScore ?? 0
  const interaction = signals.interactionScore ?? 0
  const moderation = signals.moderationScore ?? 0
  const legacy = signals.legacyContributionScore ?? 0
  const security = signals.securityScore ?? 0

  const weighted =
    discovery * 1.6 + contribution * 1.35 + interaction * 0.85 + moderation * 0.55 + legacy * 0.35

  return clamp(Math.round(weighted + security * 0.4))
}

export const getTrustFromReputation = (score: number): TrustProfile => {
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

export const buildTrustProfile = (signals: ReputationSignals): TrustProfile => {
  const hidden = calculateHiddenReputation(signals)
  return getTrustFromReputation(hidden)
}
