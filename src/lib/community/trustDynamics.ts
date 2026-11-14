import type { Payload, PayloadRequest } from 'payload'

import { TRUST_LEVEL_THRESHOLDS, type TrustLevel, type TrustThreshold } from './reputation'

/**
 * Population-relative trust dynamics (Bobhund suggestion #3).
 *
 * The base ladder in `reputation.ts` is a static fallback. On a live community
 * the *effective* thresholds must move with the population: if a level becomes
 * crowded (too many members hold it), it should become harder to reach; if
 * activity drops and members decay out of a level, it should relax again. This
 * module computes that adjustment from the observed distribution and smooths it
 * with an exponential moving average so thresholds drift instead of jumping.
 *
 * Algorithm (per level, skipping the `newcomer` baseline):
 *
 *   1. `observed` = share of active members at or above the level.
 *   2. `target`   = desired share at or above the level (a long-tail pyramid).
 *   3. `pressure` = observed / target.
 *   4. `desiredScale` = clamp(pressure ^ 0.5, MIN_SCALE, MAX_SCALE).
 *   5. `scale` = EMA(previousScale, desiredScale, ALPHA).
 *   6. `threshold` = baseMin * scale, forced strictly increasing.
 *
 * The square root keeps the response gentle: a level that is 4× too crowded
 * only doubles its requirement. `MIN_POPULATION` keeps small/new instances
 * (including the test database) on the base ladder so behaviour stays
 * deterministic until there is a real distribution to learn from.
 */

export const TRUST_DYNAMICS_TTL_MS = 6 * 60 * 60 * 1000
export const TRUST_DYNAMICS_MIN_POPULATION = 25
export const TRUST_DYNAMICS_EMA_ALPHA = 0.3
export const TRUST_DYNAMICS_MIN_SCALE = 0.5
export const TRUST_DYNAMICS_MAX_SCALE = 3
export const TRUST_DYNAMICS_ACTIVE_WINDOW_DAYS = 30

/**
 * Dynamic thresholds are enabled by default in production. Development, test
 * and e2e runs stay on the base ladder unless `TRUST_DYNAMICS_ENABLED=true` is
 * set explicitly, so accumulated fixture accounts cannot make the ladder drift
 * between runs.
 */
export const isTrustDynamicsEnabled = (): boolean => {
  const flag = process.env.TRUST_DYNAMICS_ENABLED
  if (flag === 'true') return true
  if (flag === 'false') return false
  return process.env.NODE_ENV === 'production'
}

/**
 * Desired share of active members at or above each level. The pyramid is
 * deliberately steep: most members should sit at `regular`, with only a tiny
 * `legend` cohort. These targets are product policy, not measurements.
 */
export const TRUST_LEVEL_TARGET_SHARE: Record<TrustLevel, number> = {
  newcomer: 1,
  regular: 0.55,
  recognized: 0.3,
  trusted: 0.17,
  veteran: 0.09,
  curator: 0.045,
  pillar: 0.018,
  legend: 0.007,
}

export interface TrustDynamicsLevel {
  level: TrustLevel
  /** Active members currently at this exact level. */
  count: number
  /** Share of active members at or above this level (0..1). */
  share: number
  /** Effective numeric threshold after scaling. */
  threshold: number
  /** Applied scale (1 = base ladder). */
  scale: number
}

export interface TrustDynamicsSnapshot {
  computedAt: string
  totalActiveMembers: number
  levels: TrustDynamicsLevel[]
  thresholds: TrustThreshold[]
}

export interface ComputeTrustDynamicsInput {
  /** Active-member counts keyed by exact trust level. */
  counts: Partial<Record<TrustLevel, number>>
  /** Previous snapshot, used for EMA smoothing. */
  previous?: TrustDynamicsSnapshot | null
  now?: Date
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const baseThreshold = (level: TrustLevel): number =>
  TRUST_LEVEL_THRESHOLDS.find((entry) => entry.value === level)?.min ?? 0

const baseLabel = (level: TrustLevel): string =>
  TRUST_LEVEL_THRESHOLDS.find((entry) => entry.value === level)?.label ?? level

export const BASE_TRUST_DYNAMICS: TrustDynamicsSnapshot = {
  computedAt: new Date(0).toISOString(),
  totalActiveMembers: 0,
  levels: TRUST_LEVEL_THRESHOLDS.map((entry) => ({
    level: entry.value,
    count: 0,
    share: entry.value === 'newcomer' ? 1 : 0,
    threshold: entry.min,
    scale: 1,
  })),
  thresholds: TRUST_LEVEL_THRESHOLDS,
}

const thresholdsFromLevels = (levels: TrustDynamicsLevel[]): TrustThreshold[] =>
  levels.map((level) => ({
    value: level.level,
    label: baseLabel(level.level),
    min: level.threshold,
  }))

/** Pure population-relative threshold computation. */
export const computeTrustDynamics = ({
  counts,
  previous,
  now = new Date(),
}: ComputeTrustDynamicsInput): TrustDynamicsSnapshot => {
  const total = TRUST_LEVEL_THRESHOLDS.reduce(
    (acc, entry) => acc + Math.max(0, Math.floor(counts[entry.value] ?? 0)),
    0,
  )

  if (total < TRUST_DYNAMICS_MIN_POPULATION) {
    return {
      ...BASE_TRUST_DYNAMICS,
      computedAt: now.toISOString(),
      totalActiveMembers: total,
      levels: BASE_TRUST_DYNAMICS.levels.map((level) => ({
        ...level,
        count: Math.max(0, Math.floor(counts[level.level] ?? 0)),
        share: total > 0 ? Math.max(0, Math.floor(counts[level.level] ?? 0)) / total : 0,
      })),
    }
  }

  const previousScaleByLevel = new Map<TrustLevel, number>(
    (previous?.levels ?? []).map((level) => [level.level, level.scale]),
  )

  // Count of members strictly below each level, so we can derive "at or above".
  let below = 0
  let lastThreshold = 0
  const levels: TrustDynamicsLevel[] = []

  for (const entry of TRUST_LEVEL_THRESHOLDS) {
    const count = Math.max(0, Math.floor(counts[entry.value] ?? 0))
    const atOrAbove = total - below
    const share = atOrAbove / total

    let threshold = entry.min
    let scale = 1

    if (entry.min > 0) {
      const target = TRUST_LEVEL_TARGET_SHARE[entry.value]
      const pressure = target > 0 ? share / target : 1
      const desiredScale = clamp(
        Math.sqrt(pressure),
        TRUST_DYNAMICS_MIN_SCALE,
        TRUST_DYNAMICS_MAX_SCALE,
      )
      const previousScale = previousScaleByLevel.get(entry.value)
      scale =
        previousScale === undefined
          ? desiredScale
          : previousScale * (1 - TRUST_DYNAMICS_EMA_ALPHA) + desiredScale * TRUST_DYNAMICS_EMA_ALPHA
      threshold = Math.max(lastThreshold + 1, Math.round(entry.min * scale))
    }

    lastThreshold = threshold
    below += count

    levels.push({
      level: entry.value,
      count,
      share,
      threshold,
      scale: Math.round(scale * 1000) / 1000,
    })
  }

  return {
    computedAt: now.toISOString(),
    totalActiveMembers: total,
    levels,
    thresholds: thresholdsFromLevels(levels),
  }
}

/** Converts a persisted global row into a snapshot (tolerant of partial data). */
export const snapshotFromStored = (
  stored:
    | {
        computedAt?: string | null
        totalActiveMembers?: number | null
        levels?: Array<{
          level?: string | null
          count?: number | null
          share?: number | null
          threshold?: number | null
          scale?: number | null
        }> | null
      }
    | null
    | undefined,
): TrustDynamicsSnapshot | null => {
  if (!stored?.levels || stored.levels.length !== TRUST_LEVEL_THRESHOLDS.length) return null

  const levels: TrustDynamicsLevel[] = []
  for (const entry of TRUST_LEVEL_THRESHOLDS) {
    const row = stored.levels.find((candidate) => candidate.level === entry.value)
    if (!row || typeof row.threshold !== 'number') return null

    levels.push({
      level: entry.value,
      count: row.count ?? 0,
      share: row.share ?? 0,
      threshold: row.threshold,
      scale: row.scale ?? 1,
    })
  }

  return {
    computedAt: stored.computedAt ?? new Date(0).toISOString(),
    totalActiveMembers: stored.totalActiveMembers ?? 0,
    levels,
    thresholds: thresholdsFromLevels(levels),
  }
}

export const isTrustDynamicsStale = (
  snapshot: TrustDynamicsSnapshot | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!snapshot) return true
  const computedAt = new Date(snapshot.computedAt).getTime()
  if (Number.isNaN(computedAt)) return true
  return now.getTime() - computedAt >= TRUST_DYNAMICS_TTL_MS
}

const activeSinceIso = (now: Date): string =>
  new Date(now.getTime() - TRUST_DYNAMICS_ACTIVE_WINDOW_DAYS * 86_400_000).toISOString()

const readCounts = async (
  payload: Payload,
  req: PayloadRequest | undefined,
  now: Date,
): Promise<Partial<Record<TrustLevel, number>>> => {
  const reqScope = req ? { req } : {}
  const docs = await payload.find({
    collection: 'users',
    where: {
      lastActiveAt: { greater_than: activeSinceIso(now) },
    },
    pagination: false,
    depth: 0,
    select: { trustLevel: true },
    overrideAccess: true,
    ...reqScope,
  })

  const counts: Partial<Record<TrustLevel, number>> = {}
  for (const doc of docs.docs as Array<{ trustLevel?: TrustLevel | null }>) {
    const level = doc.trustLevel ?? 'newcomer'
    counts[level] = (counts[level] ?? 0) + 1
  }
  return counts
}

let refreshInFlight: Promise<TrustDynamicsSnapshot> | null = null

/** Recomputes the snapshot from live activity and persists it on the global. */
export const refreshTrustDynamics = async (
  payload: Payload,
  req?: PayloadRequest,
): Promise<TrustDynamicsSnapshot> => {
  const now = new Date()
  const reqScope = req ? { req } : {}

  const stored = await payload.findGlobal({
    slug: 'community-dynamics',
    depth: 0,
    overrideAccess: true,
    ...reqScope,
  })
  const previous = snapshotFromStored(stored)

  const counts = await readCounts(payload, req, now)
  const snapshot = computeTrustDynamics({ counts, previous, now })

  await payload.updateGlobal({
    slug: 'community-dynamics',
    data: {
      computedAt: snapshot.computedAt,
      totalActiveMembers: snapshot.totalActiveMembers,
      levels: snapshot.levels,
    },
    overrideAccess: true,
    ...reqScope,
  })

  return snapshot
}

/**
 * Returns the current effective trust dynamics, refreshing when the snapshot is
 * missing or older than the TTL. Callers may pass a request scope so the read
 * and refresh stay inside the surrounding transaction.
 */
export const loadTrustDynamics = async (
  payload: Payload,
  req?: PayloadRequest,
): Promise<TrustDynamicsSnapshot> => {
  if (!isTrustDynamicsEnabled()) return BASE_TRUST_DYNAMICS

  const reqScope = req ? { req } : {}
  const stored = await payload.findGlobal({
    slug: 'community-dynamics',
    depth: 0,
    overrideAccess: true,
    ...reqScope,
  })
  const snapshot = snapshotFromStored(stored)

  if (snapshot && !isTrustDynamicsStale(snapshot)) return snapshot

  // Collapse concurrent refreshes only when there is no request transaction.
  if (!req) {
    if (refreshInFlight) return refreshInFlight
    refreshInFlight = refreshTrustDynamics(payload).finally(() => {
      refreshInFlight = null
    })
    return refreshInFlight
  }

  return refreshTrustDynamics(payload, req)
}

/** Test helper: drop the in-process refresh promise. */
export const resetTrustDynamicsCache = (): void => {
  refreshInFlight = null
}
