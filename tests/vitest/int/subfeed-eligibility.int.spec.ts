import { Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'
import { faker } from '@faker-js/faker'

import { getTestPayload } from '../utils/test-user'
import { createTestUser } from './helpers'
import {
  SUBFEED_CREATION_INELIGIBLE_MESSAGE,
  SUBFEED_CREATION_LOCKED_MESSAGE,
  SUBFEED_STRONG_RECRUITER_THRESHOLD,
  assertSubfeedCreationEligible,
  evaluateSubfeedEligibility,
  getSubfeedEligibilityForUser,
} from '@/lib/community/subfeedEligibility'

const createRichText = (text: string) => ({
  root: {
    children: [
      {
        children: [
          {
            detail: 0 as const,
            format: 0 as const,
            mode: 'normal' as const,
            style: '',
            text,
            type: 'text' as const,
            version: 1 as const,
          },
        ],
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0,
        type: 'paragraph' as const,
        version: 1 as const,
        textFormat: 0 as const,
        textStyle: '',
      },
    ],
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    type: 'root' as const,
    version: 1,
  },
})

describe('SubFeed creation eligibility (pure)', () => {
  it('qualifies a member with uploader candidacy', () => {
    const result = evaluateSubfeedEligibility({ signals: { contributionScore: 90 } })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toContain('uploader-candidacy')
  })

  it('qualifies a member with strong recruiter standing', () => {
    const result = evaluateSubfeedEligibility({ signals: { recruiterScore: 60 } })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toContain('strong-recruiter')
  })

  it('qualifies a member who holds the uploader role', () => {
    const result = evaluateSubfeedEligibility({
      signals: { contributionScore: 0 },
      roles: ['user', 'uploader'],
    })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toContain('uploader-candidacy')
  })

  it('qualifies a site admin regardless of signals', () => {
    const result = evaluateSubfeedEligibility({
      signals: {},
      roles: ['admin', 'user'],
    })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toContain('admin')
  })

  it('qualifies a member with editor candidacy', () => {
    const result = evaluateSubfeedEligibility({
      signals: { contributionScore: 200, interactionScore: 50 },
    })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toContain('editor-candidacy')
  })

  it('rejects a fresh account with no standing', () => {
    const result = evaluateSubfeedEligibility({ signals: {} })
    expect(result.eligible).toBe(false)
    expect(result.locked).toBe(false)
    expect(result.missing).toEqual(['uploader-candidacy', 'editor-candidacy', 'strong-recruiter'])
  })

  it('rejects a member just below the uploader candidacy threshold', () => {
    // 83 Contribution Points is one short of the 84-point solo candidacy gate.
    const result = evaluateSubfeedEligibility({ signals: { contributionScore: 83 } })
    expect(result.eligible).toBe(false)
    expect(result.progress.find((p) => p.requirement === 'uploader-candidacy')?.met).toBe(false)
  })

  it('blocks a frozen standing even when the member would otherwise qualify', () => {
    const result = evaluateSubfeedEligibility({
      signals: { contributionScore: 200 },
      roles: ['user', 'uploader'],
      standingLocked: true,
    })
    expect(result.eligible).toBe(false)
    expect(result.locked).toBe(true)
  })

  it('blocks a candidacy path whose role was revoked by an admin', () => {
    // 120 Contribution Points clears the uploader solo candidacy gate (84)...
    const withoutRevocation = evaluateSubfeedEligibility({ signals: { contributionScore: 120 } })
    expect(withoutRevocation.reasons).toContain('uploader-candidacy')

    // ...but an admin-revoked uploader role removes uploader candidacy entirely.
    const result = evaluateSubfeedEligibility({
      signals: { contributionScore: 120 },
      roles: ['user', 'uploader'],
      revokedRoles: ['uploader'],
    })
    expect(result.eligible).toBe(false)
    expect(result.reasons).not.toContain('uploader-candidacy')
    expect(result.progress.find((p) => p.requirement === 'uploader-candidacy')?.met).toBe(false)
  })

  it('still allows other candidacy paths when only one role was revoked', () => {
    const result = evaluateSubfeedEligibility({
      signals: { contributionScore: 200 },
      revokedRoles: ['uploader'],
    })
    // 200 Contribution clears the editor solo candidacy gate (196).
    expect(result.eligible).toBe(true)
    expect(result.reasons).toContain('editor-candidacy')
    expect(result.reasons).not.toContain('uploader-candidacy')
  })

  it('exposes the calibrated strong recruiter threshold', () => {
    expect(SUBFEED_STRONG_RECRUITER_THRESHOLD).toBe(60)
  })
})

describe('SubFeed creation eligibility integration', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getTestPayload()
  })

  const createEligibleUser = async () => {
    const user = await createTestUser(payload)
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { contributionScore: 120, lastActiveAt: new Date().toISOString() },
      overrideAccess: true,
    })
    return user
  }

  it('allows an eligible member to create a SubFeed', async () => {
    const user = await createEligibleUser()
    const unique = faker.string.alphanumeric(8).toLowerCase()

    const subfeed = await payload.create({
      collection: 'subfeeds',
      data: {
        name: `Eligible SubFeed ${unique}`,
        slug: `eligible-subfeed-${unique}`,
        description: `Created by an eligible member ${unique}`,
        moderators: [user.id],
        members: [user.id],
      },
      user,
      overrideAccess: false,
    })

    expect(subfeed.id).toBeDefined()
    expect(subfeed.slug).toBe(`eligible-subfeed-${unique}`)
  })

  it('rejects an ineligible member from creating a SubFeed at the collection level', async () => {
    const user = await createTestUser(payload)
    const unique = faker.string.alphanumeric(8).toLowerCase()

    await expect(
      payload.create({
        collection: 'subfeeds',
        data: {
          name: `Ineligible SubFeed ${unique}`,
          slug: `ineligible-subfeed-${unique}`,
          description: `Created by an ineligible member ${unique}`,
          moderators: [user.id],
          members: [user.id],
        },
        user,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('rejects an ineligible member via the server-action guard with an informative error', async () => {
    const user = await createTestUser(payload)

    await expect(assertSubfeedCreationEligible(payload, user.id)).rejects.toThrow(
      SUBFEED_CREATION_INELIGIBLE_MESSAGE,
    )
  })

  it('rejects a frozen-standing member with the locked message', async () => {
    const user = await createTestUser(payload)
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { contributionScore: 200, standingLocked: true },
      overrideAccess: true,
    })

    await expect(assertSubfeedCreationEligible(payload, user.id)).rejects.toThrow(
      SUBFEED_CREATION_LOCKED_MESSAGE,
    )
  })

  it('rejects a member whose candidacy roles were all revoked despite qualifying scores', async () => {
    const user = await createTestUser(payload)
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        contributionScore: 200,
        revokedRoles: ['uploader', 'editor', 'recruiter'],
        lastActiveAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })

    // 200 Contribution would clear both the uploader (84) and editor (196)
    // solo candidacy gates, but every path was revoked by an admin.
    await expect(assertSubfeedCreationEligible(payload, user.id)).rejects.toThrow(
      SUBFEED_CREATION_INELIGIBLE_MESSAGE,
    )
  })

  it('passes the guard for an eligible member', async () => {
    const user = await createEligibleUser()
    const result = await assertSubfeedCreationEligible(payload, user.id)
    expect(result.eligible).toBe(true)
  })

  it('still lets an ineligible member publish to their User Feed', async () => {
    const user = await createTestUser(payload)
    const unique = faker.string.alphanumeric(10).toLowerCase()

    // Regression guard: the user must still be ineligible for SubFeed creation.
    const eligibility = await getSubfeedEligibilityForUser(payload, user.id)
    expect(eligibility?.eligible).toBe(false)

    const post = await payload.create({
      collection: 'posts',
      data: {
        title: `User Feed Post ${unique}`,
        content: createRichText('Still publishing to my own feed.'),
        type: 'discussion',
        user: user.id,
        feed: 'user',
      },
      user,
      overrideAccess: false,
    })

    expect(post.id).toBeDefined()
    expect(post.feed).toBe('user')
  })
})
