import type { PayloadRequest } from 'payload'

export interface SignalDeltas {
  discoveryScore?: number
  contributionScore?: number
  interactionScore?: number
  likabilityScore?: number
  cleaningScore?: number
  recruiterScore?: number
  moderationScore?: number
  securityScore?: number
  legacyContributionScore?: number
}

const readNum = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return 0
}

export const resolveID = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number') return id
    if (typeof id === 'string') {
      const parsed = Number(id)
      return Number.isFinite(parsed) ? parsed : null
    }
  }

  return null
}

const calculateStreak = (
  previousLastActiveAt?: string | null,
  previousStreak?: number | null,
): number => {
  const streak = readNum(previousStreak)
  if (!previousLastActiveAt) return Math.max(1, streak)

  const previous = new Date(previousLastActiveAt)
  if (Number.isNaN(previous.getTime())) return Math.max(1, streak)

  const now = new Date()

  const previousDay = Date.UTC(
    previous.getUTCFullYear(),
    previous.getUTCMonth(),
    previous.getUTCDate(),
  )
  const currentDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const diffDays = Math.floor((currentDay - previousDay) / 86_400_000)

  if (diffDays <= 0) return Math.max(1, streak)
  if (diffDays === 1) return Math.max(1, streak + 1)
  return 1
}

export const isTrustedUser = (userLike: unknown): boolean => {
  if (!userLike || typeof userLike !== 'object') return false

  const trustLevel =
    'trustLevel' in userLike && typeof userLike.trustLevel === 'string' ? userLike.trustLevel : ''
  const roles = 'roles' in userLike && Array.isArray(userLike.roles) ? userLike.roles : []

  if (roles.includes('admin') || roles.includes('moderator') || roles.includes('editor')) {
    return true
  }

  return ['trusted', 'veteran', 'curator', 'pillar', 'legend'].includes(trustLevel)
}

export const bumpUserSignals = async (
  req: PayloadRequest,
  userId: number | null,
  deltas: SignalDeltas,
): Promise<void> => {
  if (!userId) return

  const existing = await req.payload.findByID({
    collection: 'users',
    id: userId,
    depth: 0,
    overrideAccess: true,
    req,
  })

  if (!existing) return

  await req.payload.update({
    collection: 'users',
    id: userId,
    data: {
      discoveryScore: readNum(existing.discoveryScore) + readNum(deltas.discoveryScore),
      contributionScore: readNum(existing.contributionScore) + readNum(deltas.contributionScore),
      interactionScore: readNum(existing.interactionScore) + readNum(deltas.interactionScore),
      likabilityScore: readNum(existing.likabilityScore) + readNum(deltas.likabilityScore),
      cleaningScore: readNum(existing.cleaningScore) + readNum(deltas.cleaningScore),
      recruiterScore: readNum(existing.recruiterScore) + readNum(deltas.recruiterScore),
      moderationScore: readNum(existing.moderationScore) + readNum(deltas.moderationScore),
      securityScore: readNum(existing.securityScore) + readNum(deltas.securityScore),
      legacyContributionScore:
        readNum(existing.legacyContributionScore) + readNum(deltas.legacyContributionScore),
      streakDays: calculateStreak(existing.lastActiveAt, existing.streakDays),
      lastActiveAt: new Date().toISOString(),
    },
    overrideAccess: true,
    req,
  })
}
