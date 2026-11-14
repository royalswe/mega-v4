import { createPayloadRequest, Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'
import { faker } from '@faker-js/faker'

import { getTestPayload } from '../utils/test-user'
import { createTestUser } from './helpers'
import {
  calculateRanking,
  isEditorialPriorityActive,
  EDITORIAL_PRIORITY_BOOST,
  EDITORIAL_PRIORITY_DURATION_HOURS,
  EDITORIAL_PRIORITY_DURATION_MS,
  SUBFEED_PRIORITY_BOOST,
} from '@/lib/community/ranking'
import { AUTOMATIC_ROLES } from '@/lib/community/reputation'
import { recalculateTargetSignals } from '@/lib/community/contentSignals'
import {
  expireEditorialPriority,
  resetEditorialPrioritySweepThrottle,
} from '@/lib/community/editorialPriority'

let payload: Payload

const unique = () => faker.string.alphanumeric(10).toLowerCase()

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

describe('Editorial priority ranking behavior (pure)', () => {
  const FIXED_NOW = new Date('2026-06-01T12:00:00Z')
  const HOUR = 3_600_000

  it('boosts ranking score during the priority window', () => {
    const createdAt = new Date(FIXED_NOW.getTime() - 2 * HOUR).toISOString()
    const priorityUntil = new Date(FIXED_NOW.getTime() + 22 * HOUR).toISOString()

    const baseline = calculateRanking({
      createdAt,
      upvotes: 5,
      downvotes: 0,
      commentsCount: 2,
      now: FIXED_NOW,
    })

    const prioritized = calculateRanking({
      createdAt,
      upvotes: 5,
      downvotes: 0,
      commentsCount: 2,
      editorialPriority: true,
      editorialPriorityUntil: priorityUntil,
      now: FIXED_NOW,
    })

    expect(prioritized.editorialPriorityActive).toBe(true)
    expect(prioritized.editorialBoost).toBe(EDITORIAL_PRIORITY_BOOST)
    expect(prioritized.score).toBe(
      Math.round((baseline.score + EDITORIAL_PRIORITY_BOOST) * 100) / 100,
    )
  })

  it('transitions naturally to standard community ranking after priority window elapses', () => {
    const createdAt = new Date(FIXED_NOW.getTime() - 26 * HOUR).toISOString()
    // Priority window expired 2 hours ago
    const priorityUntil = new Date(FIXED_NOW.getTime() - 2 * HOUR).toISOString()

    const baseline = calculateRanking({
      createdAt,
      upvotes: 10,
      downvotes: 1,
      commentsCount: 4,
      now: FIXED_NOW,
    })

    const expired = calculateRanking({
      createdAt,
      upvotes: 10,
      downvotes: 1,
      commentsCount: 4,
      editorialPriority: true,
      editorialPriorityUntil: priorityUntil,
      now: FIXED_NOW,
    })

    expect(expired.editorialPriorityActive).toBe(false)
    expect(expired.editorialBoost).toBe(0)
    // The expired priority item has identical score to standard community ranking with freshness decay
    expect(expired.score).toBe(baseline.score)
  })

  it('correctly reports priority status via isEditorialPriorityActive', () => {
    const future = new Date(FIXED_NOW.getTime() + 10 * HOUR).toISOString()
    const past = new Date(FIXED_NOW.getTime() - 1 * HOUR).toISOString()

    expect(
      isEditorialPriorityActive(
        { editorialPriority: true, editorialPriorityUntil: future },
        FIXED_NOW,
      ),
    ).toBe(true)
    expect(
      isEditorialPriorityActive(
        { editorialPriority: true, editorialPriorityUntil: past },
        FIXED_NOW,
      ),
    ).toBe(false)
    expect(
      isEditorialPriorityActive(
        { editorialPriority: false, editorialPriorityUntil: future },
        FIXED_NOW,
      ),
    ).toBe(false)
    expect(isEditorialPriorityActive({}, FIXED_NOW)).toBe(false)
  })

  it('boosts SubFeed origin above User Feed origin at equal engagement', () => {
    const createdAt = new Date(FIXED_NOW.getTime() - 2 * HOUR).toISOString()
    const signals = {
      createdAt,
      upvotes: 5,
      downvotes: 0,
      commentsCount: 2,
      now: FIXED_NOW,
    }

    const userFeed = calculateRanking({ ...signals, feed: 'user' })
    const subfeed = calculateRanking({ ...signals, feed: 'subfeed' })

    expect(userFeed.subfeedBoost).toBe(0)
    expect(subfeed.subfeedBoost).toBe(SUBFEED_PRIORITY_BOOST)
    expect(subfeed.score).toBe(Math.round((userFeed.score + SUBFEED_PRIORITY_BOOST) * 100) / 100)
  })
})

describe('Direct Main Feed publications and editorial priority (integration)', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it.each(['links', 'posts'] as const)(
    'uses organic thresholds for %s flags during signal recalculation',
    async (collection) => {
      const author = await createTestUser(payload)
      const common = {
        title: `Organic thresholds ${unique()}`,
        user: author.id,
        feed: 'main' as const,
        editorialPriority: true,
        editorialPriorityUntil: new Date(Date.now() + EDITORIAL_PRIORITY_DURATION_MS).toISOString(),
      }
      const item =
        collection === 'links'
          ? await payload.create({
              collection,
              data: { ...common, url: `https://example.com/${unique()}`, type: 'article' },
              overrideAccess: true,
            })
          : await payload.create({
              collection,
              data: {
                ...common,
                content: createRichText('Organic thresholds'),
                type: 'discussion',
              },
              overrideAccess: true,
            })
      const req = await createPayloadRequest({ payload })
      await recalculateTargetSignals({ req, targetCollection: collection, targetId: item.id })
      const recalculated = await payload.findByID({
        collection,
        id: item.id,
        overrideAccess: true,
      })
      expect(recalculated.rankingScore).toBeGreaterThan(180)
      expect(recalculated.featured).toBe(false)
      expect(recalculated.breaking).toBe(false)

      await payload.update({
        collection,
        id: item.id,
        data: { sharesCount: 100 },
        overrideAccess: true,
      })
      await recalculateTargetSignals({ req, targetCollection: collection, targetId: item.id })
      const organic = await payload.findByID({
        collection,
        id: item.id,
        overrideAccess: true,
      })
      expect(organic.featured).toBe(true)
      expect(organic.breaking).toBe(true)
    },
  )

  it('automatically grants editorial priority to direct Main Feed publications by uploader role', async () => {
    const uploader = await createTestUser(payload)
    // Seed signals so the standing engine derives the uploader role — setting
    // roles directly is re-derived away on users updates (only admin persists).
    await payload.update({
      collection: 'users',
      id: uploader.id,
      data: {
        contributionScore: 200,
        lastActiveAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })

    const uploaderUser = await payload.findByID({
      collection: 'users',
      id: uploader.id,
      overrideAccess: true,
    })

    const link = await payload.create({
      collection: 'links',
      data: {
        title: `Uploader Editorial Link ${unique()}`,
        url: `https://example.com/editorial-${unique()}`,
        type: 'article',
        feed: 'main',
        user: uploader.id,
        _status: 'published',
      },
      draft: false,
      user: uploaderUser,
      overrideAccess: false,
    })

    expect(link.editorialPriority).toBe(true)
    expect(link.editorialPriorityUntil).toBeDefined()

    const until = new Date(link.editorialPriorityUntil!).getTime()
    const now = Date.now()
    // Priority window should be approximately 24 hours in the future
    expect(until).toBeGreaterThan(now + 23 * 3_600_000)
    expect(until).toBeLessThanOrEqual(now + 25 * 3_600_000)

    // Ranking score includes the ~120 boost on top of fresh score (~100)
    expect(link.rankingScore).toBeGreaterThan(200)
  })

  it('does not grant editorial priority to direct Main Feed publications by standard user', async () => {
    const standardUser = await createTestUser(payload)
    // user has only standard 'user' role

    const link = await payload.create({
      collection: 'links',
      data: {
        title: `Regular User Link ${unique()}`,
        url: `https://example.com/regular-${unique()}`,
        type: 'article',
        feed: 'main',
        user: standardUser.id,
        _status: 'published',
      },
      draft: false,
      overrideAccess: true,
    })

    expect(link.editorialPriority).toBe(false)
    expect(link.editorialPriorityUntil).toBeNull()
    // Standard fresh item ranking score is around 100, without the +120 boost
    expect(link.rankingScore).toBeLessThan(150)
  })

  it('automatically grants editorial priority to direct Main Feed posts by editor role', async () => {
    const editor = await createTestUser(payload)
    // Seed signals so the standing engine derives the editor role.
    await payload.update({
      collection: 'users',
      id: editor.id,
      data: {
        contributionScore: 300,
        interactionScore: 100,
        lastActiveAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })

    const editorUser = await payload.findByID({
      collection: 'users',
      id: editor.id,
      overrideAccess: true,
    })

    const post = await payload.create({
      collection: 'posts',
      data: {
        title: `Editor Announcement Post ${unique()}`,
        content: createRichText('Editorial announcement in main feed'),
        feed: 'main',
        user: editor.id,
        type: 'discussion',
        status: 'published',
      },
      user: editorUser,
      overrideAccess: false,
    })

    expect(post.editorialPriority).toBe(true)
    expect(post.editorialPriorityUntil).toBeDefined()
    expect(post.rankingScore).toBeGreaterThan(200)
  })

  it('starts Main Feed post priority on publication, not while forcePending', async () => {
    const user = await createTestUser(payload)
    const editor = await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        contributionScore: 300,
        interactionScore: 100,
        lastActiveAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: `Pending Editorial ${unique()}`,
        content: createRichText('Publish after review'),
        type: 'discussion',
        feed: 'main',
        user: editor.id,
      },
      user: editor,
      overrideAccess: false,
      context: { forcePending: true },
    })
    expect(post.status).toBe('pending')
    expect(post.editorialPriority).toBe(false)
    expect(post.editorialPriorityUntil).toBeNull()

    const published = await payload.update({
      collection: 'posts',
      id: post.id,
      data: { status: 'published' },
      user: editor,
      overrideAccess: false,
    })
    expect(published.editorialPriority).toBe(true)
    expect(new Date(published.editorialPriorityUntil!).getTime()).toBeGreaterThan(Date.now())

    const cleared = await payload.update({
      collection: 'posts',
      id: post.id,
      data: { editorialPriority: false, editorialPriorityUntil: null },
      user: editor,
      overrideAccess: false,
    })
    expect(cleared.editorialPriority).toBe(false)
    expect(cleared.editorialPriorityUntil).toBeNull()
  })
})

describe('Administrator safety controls: Quarantine (integration)', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('excludes quarantined links and posts from non-moderator queries', async () => {
    const author = await createTestUser(payload)
    const reader = await createTestUser(payload)
    const admin = await createTestUser(payload)
    await payload.update({
      collection: 'users',
      id: admin.id,
      data: { roles: ['admin', 'user'] },
      overrideAccess: true,
    })
    // Re-fetch so the `user` doc we pass to queries carries the admin roles.
    const adminUser = await payload.findByID({
      collection: 'users',
      id: admin.id,
      overrideAccess: true,
    })

    const link = await payload.create({
      collection: 'links',
      data: {
        title: `Quarantine Test Link ${unique()}`,
        url: `https://example.com/quarantine-${unique()}`,
        type: 'article',
        feed: 'main',
        user: author.id,
        _status: 'published',
      },
      draft: false,
      overrideAccess: true,
    })

    const post = await payload.create({
      collection: 'posts',
      data: {
        title: `Quarantine Test Post ${unique()}`,
        content: createRichText('Quarantine test post content'),
        feed: 'main',
        // Regular users' Main Feed posts are held as pending; use the admin
        // author so the post is published and publicly visible.
        user: adminUser.id,
        type: 'discussion',
        status: 'published',
      },
      overrideAccess: true,
    })

    // Reader can see both initially
    const initialLinks = await payload.find({
      collection: 'links',
      where: { id: { equals: link.id } },
      user: reader,
      overrideAccess: false,
    })
    const initialPosts = await payload.find({
      collection: 'posts',
      where: { id: { equals: post.id } },
      user: reader,
      overrideAccess: false,
    })
    expect(initialLinks.docs.length).toBe(1)
    expect(initialPosts.docs.length).toBe(1)

    // Admin quarantines both items
    await payload.update({
      collection: 'links',
      id: link.id,
      data: { quarantined: true },
      overrideAccess: true,
    })
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { quarantined: true },
      overrideAccess: true,
    })

    // Reader queries again: quarantined items are hidden
    const hiddenLinks = await payload.find({
      collection: 'links',
      where: { id: { equals: link.id } },
      user: reader,
      overrideAccess: false,
    })
    const hiddenPosts = await payload.find({
      collection: 'posts',
      where: { id: { equals: post.id } },
      user: reader,
      overrideAccess: false,
    })
    expect(hiddenLinks.docs.length).toBe(0)
    expect(hiddenPosts.docs.length).toBe(0)

    // Admin can still view quarantined content
    const adminLinks = await payload.find({
      collection: 'links',
      where: { id: { equals: link.id } },
      user: adminUser,
      overrideAccess: false,
    })
    const adminPosts = await payload.find({
      collection: 'posts',
      where: { id: { equals: post.id } },
      user: adminUser,
      overrideAccess: false,
    })
    expect(adminLinks.docs.length).toBe(1)
    expect(adminPosts.docs.length).toBe(1)
    expect(adminLinks.docs[0].quarantined).toBe(true)
    expect(adminPosts.docs[0].quarantined).toBe(true)

    // Admin unquarantines: visibility restored
    await payload.update({
      collection: 'links',
      id: link.id,
      data: { quarantined: false },
      overrideAccess: true,
    })
    const restoredLinks = await payload.find({
      collection: 'links',
      where: { id: { equals: link.id } },
      user: reader,
      overrideAccess: false,
    })
    expect(restoredLinks.docs.length).toBe(1)
    expect(restoredLinks.docs[0].quarantined).toBe(false)
  })
})

describe('Administrator safety controls: Promotion and role rollbacks (integration)', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('rolls back promotion and editorial priority cleanly', async () => {
    const author = await createTestUser(payload)
    const booster = await createTestUser(payload)
    const admin = await createTestUser(payload)
    await payload.update({
      collection: 'users',
      id: admin.id,
      data: { roles: ['admin', 'user'] },
      overrideAccess: true,
    })
    const adminUser = await payload.findByID({
      collection: 'users',
      id: admin.id,
      overrideAccess: true,
    })

    const link = await payload.create({
      collection: 'links',
      data: {
        title: `Promotion Rollback Test ${unique()}`,
        url: `https://example.com/rollback-${unique()}`,
        type: 'article',
        feed: 'main',
        user: author.id,
        featured: true,
        discoveryBoosted: true,
        boostedAt: new Date().toISOString(),
        boostedBy: booster.id,
        editorialPriority: true,
        editorialPriorityUntil: new Date(Date.now() + EDITORIAL_PRIORITY_DURATION_MS).toISOString(),
        _status: 'published',
      },
      draft: false,
      user: adminUser,
      overrideAccess: false,
    })

    expect(link.featured).toBe(true)
    expect(link.discoveryBoosted).toBe(true)
    expect(link.editorialPriority).toBe(true)

    // Admin triggers rollback
    const rolledBack = await payload.update({
      collection: 'links',
      id: link.id,
      data: {
        featured: false,
        discoveryBoosted: false,
        boostedAt: null,
        boostedBy: null,
        editorialPriority: false,
        editorialPriorityUntil: null,
      },
      user: adminUser,
      overrideAccess: false,
    })

    expect(rolledBack.featured).toBe(false)
    expect(rolledBack.discoveryBoosted).toBe(false)
    expect(rolledBack.boostedAt).toBeNull()
    expect(rolledBack.boostedBy).toBeNull()
    expect(rolledBack.editorialPriority).toBe(false)
    expect(rolledBack.editorialPriorityUntil).toBeNull()
    // Ranking score returns to baseline without priority boost
    expect(rolledBack.rankingScore).toBeLessThan(150)
  })

  it('locks standing and rolls back automatically earned roles for an account', async () => {
    const user = await createTestUser(payload)

    // User earns editor role via activity signals
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        contributionScore: 300,
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

    // Admin safety intervention: rollback earned roles and lock standing
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        revokedRoles: [...AUTOMATIC_ROLES],
        standingLocked: true,
        roles: ['user'],
      },
      overrideAccess: true,
    })

    const locked = await payload.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    })

    expect(locked.standingLocked).toBe(true)
    expect(locked.roles).not.toContain('editor')
    expect(locked.roles).toEqual(['user'])
    expect(locked.revokedRoles).toContain('editor')
    expect(locked.revokedRoles).toContain('uploader')

    // Subsequent activity cannot re-grant the revoked roles while standing is locked
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        contributionScore: 800,
        discoveryScore: 500,
        lastActiveAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })

    const afterActivity = await payload.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    })

    expect(afterActivity.roles).not.toContain('editor')
    expect(afterActivity.roles).not.toContain('uploader')
    expect(afterActivity.roles).toEqual(['user'])
  })
})

describe('Editorial priority expiry sweep (integration)', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('drops the ranking boost and clears the flag after the window lapses', async () => {
    const author = await createTestUser(payload)
    const windowEndsAt = new Date(Date.now() + 60_000)

    const link = await payload.create({
      collection: 'links',
      data: {
        title: `Expiry Sweep ${unique()}`,
        url: `https://example.com/expiry-${unique()}`,
        type: 'article',
        feed: 'main',
        user: author.id,
        editorialPriority: true,
        editorialPriorityUntil: windowEndsAt.toISOString(),
        _status: 'published',
      },
      draft: false,
      overrideAccess: true,
    })

    expect(link.editorialPriority).toBe(true)
    const boostedScore = link.rankingScore ?? 0
    expect(boostedScore).toBeGreaterThan(EDITORIAL_PRIORITY_BOOST)

    resetEditorialPrioritySweepThrottle()
    const result = await expireEditorialPriority({
      payload,
      force: true,
      now: new Date(windowEndsAt.getTime() + 1_000),
    })
    expect(result.processed).toBeGreaterThanOrEqual(1)

    const expired = await payload.findByID({
      collection: 'links',
      id: link.id,
      overrideAccess: true,
    })
    expect(expired.editorialPriority).toBe(false)
    expect(expired.editorialPriorityUntil).toBeNull()
    expect(expired.rankingScore ?? 0).toBeLessThan(boostedScore)
  })

  it('leaves active windows untouched', async () => {
    const author = await createTestUser(payload)
    const windowEndsAt = new Date(Date.now() + 6 * 3_600_000)

    const link = await payload.create({
      collection: 'links',
      data: {
        title: `Active Window ${unique()}`,
        url: `https://example.com/active-${unique()}`,
        type: 'article',
        feed: 'main',
        user: author.id,
        editorialPriority: true,
        editorialPriorityUntil: windowEndsAt.toISOString(),
        _status: 'published',
      },
      draft: false,
      overrideAccess: true,
    })

    resetEditorialPrioritySweepThrottle()
    await expireEditorialPriority({ payload, force: true })

    const fresh = await payload.findByID({
      collection: 'links',
      id: link.id,
      overrideAccess: true,
    })
    expect(fresh.editorialPriority).toBe(true)
    expect(fresh.editorialPriorityUntil).toBe(windowEndsAt.toISOString())
  })

  it('does not clear a window renewed after the sweep selected its expired value', async () => {
    const author = await createTestUser(payload)
    const expiredAt = new Date(Date.now() - 3_600_000).toISOString()
    const link = await payload.create({
      collection: 'links',
      data: {
        title: `Renewed Window ${unique()}`,
        url: `https://example.com/renewed-${unique()}`,
        type: 'article',
        feed: 'main',
        user: author.id,
        editorialPriority: true,
        editorialPriorityUntil: expiredAt,
        _status: 'published',
      },
      draft: false,
      overrideAccess: true,
    })
    const selected = await payload.find({
      collection: 'links',
      where: { id: { equals: link.id } },
      depth: 0,
      overrideAccess: true,
    })
    const renewedUntil = new Date(Date.now() + 6 * 3_600_000).toISOString()
    await payload.update({
      collection: 'links',
      id: link.id,
      data: { editorialPriorityUntil: renewedUntil },
      overrideAccess: true,
    })

    const find = vi.spyOn(payload, 'find').mockResolvedValueOnce(selected)
    try {
      resetEditorialPrioritySweepThrottle()
      await expireEditorialPriority({ payload, force: true })
    } finally {
      find.mockRestore()
    }

    const renewed = await payload.findByID({
      collection: 'links',
      id: link.id,
      overrideAccess: true,
    })
    expect(renewed.editorialPriority).toBe(true)
    expect(renewed.editorialPriorityUntil).toBe(renewedUntil)
    expect(renewed.rankingScore).toBeGreaterThan(EDITORIAL_PRIORITY_BOOST)
  })
})
