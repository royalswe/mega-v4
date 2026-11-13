import { describe, expect, it } from 'vitest'

import {
  BASE_TRUST_DYNAMICS,
  TRUST_DYNAMICS_EMA_ALPHA,
  TRUST_DYNAMICS_MIN_POPULATION,
  computeTrustDynamics,
  isTrustDynamicsStale,
} from '@/lib/community/trustDynamics'
import { TRUST_LEVEL_THRESHOLDS } from '@/lib/community/reputation'

const FIXED_NOW = new Date('2026-06-01T00:00:00Z')

const thresholdOf = (snapshot: ReturnType<typeof computeTrustDynamics>, level: string): number =>
  snapshot.levels.find((entry) => entry.level === level)!.threshold

describe('Population-relative trust dynamics (pure)', () => {
  it('keeps the base ladder while the population is below the minimum', () => {
    const snapshot = computeTrustDynamics({
      counts: { newcomer: 5, regular: 5 },
      now: FIXED_NOW,
    })

    expect(snapshot.totalActiveMembers).toBe(10)
    expect(snapshot.totalActiveMembers).toBeLessThan(TRUST_DYNAMICS_MIN_POPULATION)
    expect(snapshot.thresholds).toEqual(TRUST_LEVEL_THRESHOLDS)
    expect(snapshot.computedAt).toBe(FIXED_NOW.toISOString())
  })

  it('raises a level threshold when that level is overcrowded', () => {
    // 99% of a large population sits at `regular`, far above the 55% target.
    const snapshot = computeTrustDynamics({
      counts: { newcomer: 10, regular: 990 },
      now: FIXED_NOW,
    })

    expect(thresholdOf(snapshot, 'regular')).toBeGreaterThan(40)
    expect(snapshot.levels.find((entry) => entry.level === 'regular')!.share).toBeCloseTo(0.99, 5)
  })

  it('lowers a level threshold when almost nobody reaches it', () => {
    const snapshot = computeTrustDynamics({
      counts: { newcomer: 1000 },
      now: FIXED_NOW,
    })

    expect(thresholdOf(snapshot, 'recognized')).toBeLessThan(120)
    expect(thresholdOf(snapshot, 'legend')).toBeLessThan(2100)
  })

  it('smooths toward the new target with the previous scale (EMA)', () => {
    const previous = {
      ...BASE_TRUST_DYNAMICS,
      levels: BASE_TRUST_DYNAMICS.levels.map((entry) =>
        entry.level === 'regular' ? { ...entry, scale: 2 } : entry,
      ),
    }

    const snapshot = computeTrustDynamics({
      counts: { newcomer: 10, regular: 990 },
      previous,
      now: FIXED_NOW,
    })

    const regular = snapshot.levels.find((entry) => entry.level === 'regular')!
    // Desired scale is ~1.34; EMA from 2 must land between the two.
    expect(regular.scale).toBeGreaterThan(1.34)
    expect(regular.scale).toBeLessThan(2)
    expect(regular.scale).toBeCloseTo(
      2 * (1 - TRUST_DYNAMICS_EMA_ALPHA) + 1.3416 * TRUST_DYNAMICS_EMA_ALPHA,
      2,
    )
  })

  it('keeps thresholds strictly increasing even under uneven distributions', () => {
    const snapshot = computeTrustDynamics({
      counts: { newcomer: 5, regular: 995 },
      now: FIXED_NOW,
    })

    for (let index = 1; index < snapshot.thresholds.length; index += 1) {
      expect(snapshot.thresholds[index].min).toBeGreaterThan(snapshot.thresholds[index - 1].min)
    }
  })

  it('clamps scale to the configured bounds', () => {
    const snapshot = computeTrustDynamics({
      counts: { newcomer: 1, regular: 9999 },
      now: FIXED_NOW,
    })

    for (const level of snapshot.levels) {
      expect(level.scale).toBeGreaterThanOrEqual(0.5)
      expect(level.scale).toBeLessThanOrEqual(3)
    }
  })

  it('treats a missing or old snapshot as stale', () => {
    expect(isTrustDynamicsStale(null)).toBe(true)
    expect(
      isTrustDynamicsStale(
        { ...BASE_TRUST_DYNAMICS, computedAt: FIXED_NOW.toISOString() },
        FIXED_NOW,
      ),
    ).toBe(false)
    expect(
      isTrustDynamicsStale(
        {
          ...BASE_TRUST_DYNAMICS,
          computedAt: new Date(FIXED_NOW.getTime() - 7 * 3_600_000).toISOString(),
        },
        FIXED_NOW,
      ),
    ).toBe(true)
  })
})
