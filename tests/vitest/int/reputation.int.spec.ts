import { Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import { getTestPayload } from '../utils/test-user'
import { createTestUser } from './helpers'
import {
  AUTOMATIC_ROLES,
  COLD_START_FLOOR,
  HYSTERESIS_DEMOTE_MARGIN,
  HYSTERESIS_PROMOTE_MARGIN,
  RECENCY_HALF_LIFE_DAYS,
  buildPointClassProfile,
  buildTrustProfile,
  calculateEffectiveScore,
  deriveAutomaticRoles,
  recencyDecayFactor,
  resolveTrustLevel,
} from '@/lib/community/reputation'

const DAY = 86_400_000
const FIXED_NOW = new Date('2026-06-01T00:00:00Z')
const daysAgo = (days: number): string => new Date(FIXED_NOW.getTime() - days * DAY).toISOString()

describe('Community standing calculation (pure)', () => {
  it('aggregates all active signals into a weighted member value', () => {
    const profile = buildPointClassProfile({
      contributionScore: 100,
      discoveryScore: 10,
      interactionScore: 20,
    })

    // contribution(100)*1.35 + discovery(10)*1.6 + interaction(20)*0.85
    expect(profile.totalMemberValue).toBe(Math.round(100 * 1.35 + 10 * 1.6 + 20 * 0.85))
    expect(profile.contributionPoints).toBe(100)
    expect(profile.discoveryPoints).toBe(10)
  })

  it('maps member value to the correct trust level and public label', () => {
    const trust = buildTrustProfile(
      { contributionScore: 100, lastActiveAt: daysAgo(0) },
      { now: FIXED_NOW },
    )

    expect(trust.trustLevel).toBe('recognized')
    expect(trust.reputationPublicLabel).toBe('Recognized')
    expect(trust.reputationHidden).toBe(135)
  })

  it('applies a cold-start floor for active early contributors', () => {
    const trust = buildTrustProfile(
      { contributionScore: 5, lastActiveAt: daysAgo(0) },
      { now: FIXED_NOW },
    )

    // raw weighted is only ~7, but the floor raises active contributors to `regular`.
    expect(trust.trustLevel).toBe('regular')
    expect(trust.reputationHidden).toBe(COLD_START_FLOOR)
  })

  it('does not floor brand-new accounts with zero activity', () => {
    const trust = buildTrustProfile({ lastActiveAt: daysAgo(0) }, { now: FIXED_NOW })
    expect(trust.trustLevel).toBe('newcomer')
    expect(trust.reputationHidden).toBe(0)
  })

  it('decays standing exponentially with inactivity', () => {
    expect(recencyDecayFactor(daysAgo(0), FIXED_NOW)).toBe(1)
    expect(recencyDecayFactor(daysAgo(RECENCY_HALF_LIFE_DAYS), FIXED_NOW)).toBeCloseTo(0.5, 5)
    expect(recencyDecayFactor(daysAgo(RECENCY_HALF_LIFE_DAYS * 2), FIXED_NOW)).toBeCloseTo(0.25, 5)
  })

  it('cools down standing and drops below the floor after prolonged inactivity', () => {
    const active = calculateEffectiveScore(135, daysAgo(0), FIXED_NOW)
    expect(active.effective).toBe(135)
    expect(active.recentlyActive).toBe(true)

    const cooled = calculateEffectiveScore(135, daysAgo(90), FIXED_NOW)
    expect(cooled.factor).toBeCloseTo(0.25, 5)
    expect(cooled.recentlyActive).toBe(false)
    expect(cooled.floored).toBe(false)
    expect(cooled.effective).toBe(34)

    const trust = buildTrustProfile(
      { contributionScore: 100, lastActiveAt: daysAgo(90) },
      { now: FIXED_NOW },
    )
    expect(trust.trustLevel).toBe('newcomer')
  })
})

describe('Trust-level hysteresis (pure)', () => {
  it('promotes only once the score clears the target threshold by the promote margin', () => {
    expect(resolveTrustLevel(125, 'regular')).toBe('regular')
    expect(resolveTrustLevel(120 + HYSTERESIS_PROMOTE_MARGIN, 'regular')).toBe('recognized')
    expect(resolveTrustLevel(130, undefined)).toBe('recognized')
  })

  it('demotes only once the score falls below the current threshold by the demote margin', () => {
    expect(resolveTrustLevel(115, 'recognized')).toBe('recognized')
    expect(resolveTrustLevel(120 - HYSTERESIS_DEMOTE_MARGIN - 1, 'recognized')).toBe('regular')
  })

  it('exempts the cold-start newcomer→regular promotion from the promote margin', () => {
    expect(resolveTrustLevel(COLD_START_FLOOR, 'newcomer')).toBe('regular')
    expect(resolveTrustLevel(122, 'newcomer')).toBe('recognized')
  })
})

describe('Automatic role derivation (pure)', () => {
  it('derives uploader from recognition + contribution', () => {
    const roles = deriveAutomaticRoles({ contributionScore: 90, lastActiveAt: daysAgo(0) }, ['user'], {
      now: FIXED_NOW,
    })
    expect(roles).toContain('uploader')
    expect(roles).toContain('user')
  })

  it('retains an earned role through a minor signal dip (role hysteresis)', () => {
    const earned = deriveAutomaticRoles(
      { contributionScore: 210, interactionScore: 100, lastActiveAt: daysAgo(0) },
      ['user'],
      { now: FIXED_NOW },
    )
    expect(earned).toContain('editor')

    // Slight dip: still qualifies for retention, but not fresh promotion.
    const retained = deriveAutomaticRoles(
      { contributionScore: 150, interactionScore: 100, lastActiveAt: daysAgo(0) },
      earned,
      { now: FIXED_NOW },
    )
    expect(retained).toContain('editor')

    // Without the prior role, the same signals do NOT grant editor fresh.
    const fresh = deriveAutomaticRoles(
      { contributionScore: 150, interactionScore: 100, lastActiveAt: daysAgo(0) },
      ['user'],
      { now: FIXED_NOW },
    )
    expect(fresh).not.toContain('editor')
  })

  it('freezes roles when locked', () => {
    const roles = deriveAutomaticRoles(
      { contributionScore: 210, interactionScore: 100, lastActiveAt: daysAgo(0) },
      ['user'],
      { now: FIXED_NOW, rolesLocked: true },
    )
    expect(roles).toEqual(['user'])
  })

  it('never re-grants revoked roles', () => {
    const roles = deriveAutomaticRoles(
      { contributionScore: 210, interactionScore: 100, lastActiveAt: daysAgo(0) },
      ['user'],
      { now: FIXED_NOW, revokedRoles: ['editor'] },
    )
    expect(roles).toContain('uploader')
    expect(roles).not.toContain('editor')
  })

  it('only exposes the expected automatic role set', () => {
    expect(AUTOMATIC_ROLES).toEqual(['uploader', 'editor', 'moderator', 'cleaner', 'recruiter'])
  })
})

describe('Community standing integration', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('syncs standing, trust level and roles from signals on update', async () => {
    const user = await createTestUser(payload)

    await payload.update({
      collection: 'users',
      id: user.id,
      data: { contributionScore: 100, lastActiveAt: new Date().toISOString() },
      overrideAccess: true,
    })

    const fresh = await payload.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    })

    expect(fresh.trustLevel).toBe('recognized')
    expect(fresh.reputationPublicLabel).toBe('Recognized')
    expect(fresh.totalMemberValue).toBe(135)
    expect(fresh.roles).toContain('user')
    expect(fresh.roles).toContain('uploader')
    expect(fresh.isUploader).toBe(true)
  })

  it('cools down standing and roles after simulated inactivity', async () => {
    const user = await createTestUser(payload)

    await payload.update({
      collection: 'users',
      id: user.id,
      data: { contributionScore: 90, lastActiveAt: new Date().toISOString() },
      overrideAccess: true,
    })

    const active = await payload.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    })
    expect(active.trustLevel).toBe('recognized')
    expect(active.roles).toContain('uploader')

    const inactiveSince = new Date(Date.now() - 90 * DAY).toISOString()
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { lastActiveAt: inactiveSince },
      overrideAccess: true,
    })

    const cooled = await payload.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    })
    expect(cooled.trustLevel).toBe('newcomer')
    expect(cooled.roles).not.toContain('uploader')
    expect(cooled.isUploader).toBe(false)
  })

  it('holds a trust level through a minor dip (transition stability)', async () => {
    const user = await createTestUser(payload)

    await payload.update({
      collection: 'users',
      id: user.id,
      data: { contributionScore: 100, lastActiveAt: new Date().toISOString() },
      overrideAccess: true,
    })

    // Drop just below the recognized threshold (120); hysteresis should retain it.
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { contributionScore: 88 },
      overrideAccess: true,
    })

    const retained = await payload.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    })
    expect(retained.trustLevel).toBe('recognized')

    // A substantial drop crosses the demotion margin and demotes.
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { contributionScore: 70 },
      overrideAccess: true,
    })

    const demoted = await payload.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    })
    expect(demoted.trustLevel).toBe('regular')
  })

  it('lets an admin lock and revoke automatically earned roles', async () => {
    const user = await createTestUser(payload)

    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        contributionScore: 210,
        interactionScore: 100,
        lastActiveAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })

    const earned = await payload.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    })
    expect(earned.roles).toContain('editor')

    // Lock standing and revoke the editor role.
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { standingLocked: true, revokedRoles: ['editor'] },
      overrideAccess: true,
    })

    const locked = await payload.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    })
    expect(locked.standingLocked).toBe(true)
    expect(locked.revokedRoles).toContain('editor')
    expect(locked.roles).not.toContain('editor')

    // Further strong activity must not re-grant the frozen/revoked role.
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        contributionScore: 500,
        interactionScore: 500,
        lastActiveAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })

    const after = await payload.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    })
    expect(after.roles).not.toContain('editor')
  })
})
