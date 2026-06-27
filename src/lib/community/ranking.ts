export interface RankingInput {
  createdAt?: string | Date | null
  upvotes?: number
  downvotes?: number
  commentsCount?: number
  sharesCount?: number
  uniqueCommenters?: number
  trustedInteractions?: number
  discoveryMomentum?: number
  spamProbability?: number
  ragebaitProbability?: number
}

export interface RankingOutput {
  score: number
  controversyScore: number
  engagementVelocity: number
  spamProbability: number
  ragebaitProbability: number
}

const clamp = (value: number, min = 0, max = 1): number => {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return fallback
}

const getAgeHours = (createdAt?: string | Date | null): number => {
  if (!createdAt) return 0
  const dateValue = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime()
  if (Number.isNaN(dateValue)) return 0
  return Math.max(0, (Date.now() - dateValue) / 3_600_000)
}

export const calculateControversyScore = ({ upvotes = 0, downvotes = 0 }: RankingInput): number => {
  const up = Math.max(0, asNumber(upvotes))
  const down = Math.max(0, asNumber(downvotes))
  if (up + down === 0) return 0

  const balance = 1 - Math.abs(up - down) / (up + down)
  return Math.round(balance * Math.log2(up + down + 1) * 100)
}

export const calculateRanking = (input: RankingInput): RankingOutput => {
  const upvotes = Math.max(0, asNumber(input.upvotes))
  const downvotes = Math.max(0, asNumber(input.downvotes))
  const commentsCount = Math.max(0, asNumber(input.commentsCount))
  const sharesCount = Math.max(0, asNumber(input.sharesCount))
  const uniqueCommenters = Math.max(0, asNumber(input.uniqueCommenters))
  const trustedInteractions = Math.max(0, asNumber(input.trustedInteractions))
  const discoveryMomentum = Math.max(0, asNumber(input.discoveryMomentum))

  const ageHours = getAgeHours(input.createdAt)
  const freshness = Math.max(0, 100 - ageHours * 3.2)

  const interactions = upvotes + downvotes + commentsCount * 1.2 + sharesCount * 1.5
  const engagementVelocity = interactions / (ageHours + 2)

  const spamProbability =
    input.spamProbability == null
      ? clamp((downvotes * 1.35 + commentsCount * 0.15 - uniqueCommenters * 0.9) / 120)
      : clamp(asNumber(input.spamProbability))

  const ragebaitProbability =
    input.ragebaitProbability == null
      ? clamp((Math.max(0, downvotes - upvotes * 0.45) + commentsCount * 0.2) / 100)
      : clamp(asNumber(input.ragebaitProbability))

  const controversyScore = calculateControversyScore(input)

  const weighted =
    freshness +
    engagementVelocity * 2.8 +
    uniqueCommenters * 1.9 +
    trustedInteractions * 2.5 +
    discoveryMomentum * 2.2 -
    spamProbability * 90 -
    ragebaitProbability * 70

  return {
    score: Math.round(weighted * 100) / 100,
    controversyScore,
    engagementVelocity: Math.round(engagementVelocity * 100) / 100,
    spamProbability: Math.round(spamProbability * 1000) / 1000,
    ragebaitProbability: Math.round(ragebaitProbability * 1000) / 1000,
  }
}
