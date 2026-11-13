import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload, Where } from 'payload'
import type { User } from '@/payload-types'

import { getTestPayload } from '../utils/test-user'
import { createTestLink, createTestUser } from './helpers'
import { assertMainFeedVisibility, runSeed } from '@/scripts/seed/seed'
import { seedBookmarks } from '@/scripts/seed/seeders/bookmarks.seed'
import { seedVotes } from '@/scripts/seed/seeders/votes.seed'
import { seedDiscoveries } from '@/scripts/seed/seeders/discoveries.seed'
import { seedReports } from '@/scripts/seed/seeders/reports.seed'
import { seedComments } from '@/scripts/seed/seeders/comments.seed'
import { seedPosts } from '@/scripts/seed/seeders/posts.seed'
import type { SeedUsers } from '@/scripts/seed/seeders/users.seed'
import {
  PROMOTED_EXPECTATIONS,
  SEED_CONTENT_SCENARIOS,
  SEED_INTERACTION_SCENARIOS,
  SEED_PERSONAS,
  SEED_SUBFEEDS,
  asLexicalRichText,
  offsetIsoFromReference,
  readRelationIds,
  type ContentScenarioExpectation,
  type SeededContentIndex,
} from '@/scripts/seed/seeders/utils.seed'
import { buildMainFeedWhere, isEligibleForMainFeedPromotion } from '@/lib/community/promotion'
import { canManageSubmittedLinks, canSubmitToSubfeed } from '@/lib/community/subfeeds'

const COLLECTIONS = [
  'users',
  'subfeeds',
  'links',
  'posts',
  'comments',
  'votes',
  'bookmarks',
  'discoveries',
  'reports',
] as const

type CollectionSlug = (typeof COLLECTIONS)[number]

const collectionCounts = async (payload: Payload): Promise<Record<CollectionSlug, number>> => {
  const { docs: users } = await payload.find({
    collection: 'users',
    where: { email: { in: SEED_PERSONAS.map((persona) => persona.email) } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const userIds = users.map((user) => user.id)
  const entries = await Promise.all(
    COLLECTIONS.map(async (collection) => {
      const where: Where =
        collection === 'users'
          ? { id: { in: userIds } }
          : collection === 'subfeeds'
            ? { slug: { in: SEED_SUBFEEDS.map((subfeed) => subfeed.key) } }
            : collection === 'links' || collection === 'posts'
              ? { slug: { in: SEED_CONTENT_SCENARIOS.map((scenario) => scenario.key) } }
              : { [collection === 'reports' ? 'reporter' : 'user']: { in: userIds } }
      const result = await payload.count({ collection, where, overrideAccess: true })
      return [collection, result.totalDocs] as const
    }),
  )

  return Object.fromEntries(entries) as Record<CollectionSlug, number>
}

const findUserByEmail = async (payload: Payload, email: string) => {
  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (!docs[0]) {
    throw new Error(`Seed persona with email ${email} was not created.`)
  }

  return docs[0]
}

const mockSeedFixtures = () => {
  const users: SeedUsers = new Map(
    SEED_PERSONAS.map((persona, index) => [
      persona.key,
      { id: index + 1, roles: [...persona.expectedRoles] } as User,
    ]),
  )
  const content: SeededContentIndex = new Map(
    SEED_CONTENT_SCENARIOS.map((scenario, index) => [
      scenario.key,
      { kind: scenario.kind, id: index + 100 },
    ]),
  )
  return { users, content, referenceNow: new Date('2026-11-12T09:00:00Z') }
}

describe('Seed reconciliation without a database', { concurrent: false }, () => {
  it.each([
    ['bookmark', 'bookmarks', seedBookmarks],
    ['vote', 'votes', seedVotes],
    ['discovery', 'discoveries', seedDiscoveries],
    ['report', 'reports', seedReports],
  ] as const)(
    'finds existing %s rows by their complete natural key',
    async (kind, collection, seed) => {
      const { users, content, referenceNow } = mockSeedFixtures()
      const scenarios = SEED_INTERACTION_SCENARIOS.filter((scenario) => scenario.kind === kind)
      let queryIndex = 0
      const find = vi.fn(async (options) => {
        const scenario = scenarios[queryIndex++]
        const actor = users.get(scenario.actor)!
        const target = content.get(scenario.target)!
        expect(options).toMatchObject({
          collection,
          where: {
            and: [
              { [kind === 'report' ? 'reporter' : 'user']: { equals: actor.id } },
              {
                [kind === 'report'
                  ? target.kind === 'link'
                    ? 'targetLink'
                    : 'targetPost'
                  : target.kind]: { equals: target.id },
              },
              ...(kind === 'report' ? [{ reason: { equals: scenario.reason } }] : []),
            ],
          },
          limit: 1,
        })
        return {
          docs: [
            {
              id: 1,
              vote: scenario.value,
              discoveredAt: offsetIsoFromReference(referenceNow, scenario.referenceNowOffsetHours),
              engagementGenerated: scenario.engagementGenerated ?? 0,
            },
          ],
          totalDocs: 20_001,
        }
      })
      const create = vi.fn()
      const update = vi.fn()
      const payload = { find, create, update } as unknown as Payload

      const result = await seed(payload, users, content, referenceNow)

      expect(result.skipped).toBe(scenarios.length)
      expect(create).not.toHaveBeenCalled()
      expect(update).not.toHaveBeenCalled()
    },
  )

  it.each(['visible', 'removed'] as const)(
    'restores removed comments as a moderator and checks persisted state (%s)',
    async (persistedStatus) => {
      const { users, content, referenceNow } = mockSeedFixtures()
      const scenario = SEED_INTERACTION_SCENARIOS.find((item) => item.kind === 'comment')!
      const actor = users.get(scenario.actor)!
      const target = content.get(scenario.target)!
      const existing = {
        id: 10,
        user: actor.id,
        [target.kind]: target.id,
        comment: asLexicalRichText(scenario.text!),
        moderationStatus: 'removed',
      }
      const update = vi.fn(async (options) => {
        expect(options).toMatchObject({
          id: existing.id,
          user: users.get('kalle'),
          overrideAccess: false,
          data: { user: actor.id, moderationStatus: 'visible' },
        })
        expect(options.context?.skipHooks).not.toBe(true)
        return { ...existing, moderationStatus: 'visible' }
      })
      const findByID = vi.fn(async () => ({ ...existing, moderationStatus: persistedStatus }))
      const payload = {
        find: vi.fn(async () => ({ docs: [existing] })),
        update,
        findByID,
        create: vi.fn(async () => ({ id: 11 })),
      } as unknown as Payload
      const result = seedComments(payload, users, content, referenceNow)

      if (persistedStatus === 'visible') {
        await expect(result).resolves.toMatchObject({ tally: { reconciled: 1 } })
      } else {
        await expect(result).rejects.toThrow('was not restored to visible')
      }
      expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ id: existing.id }))
    },
  )

  it('restores a previously published pending post through moderator field access', async () => {
    const { users, content, referenceNow } = mockSeedFixtures()
    const subfeeds = new Map(
      SEED_SUBFEEDS.map((subfeed, index) => [subfeed.key, { id: index + 20 }]),
    )
    const existing = SEED_CONTENT_SCENARIOS.filter((scenario) => scenario.kind === 'post').map(
      (scenario) => ({
        id: content.get(scenario.key)!.id,
        slug: scenario.key,
        feed: scenario.destination.feed,
        subfeed:
          scenario.destination.feed === 'subfeed'
            ? subfeeds.get(scenario.destination.subfeed)!.id
            : null,
        user: users.get(scenario.author)!.id,
        status: 'published',
      }),
    )
    const persisted = new Map(existing.map((post) => [post.id, post]))
    const update = vi.fn(async (options) => {
      const previous = persisted.get(options.id)!
      if (options.data.status === 'pending') {
        expect(options.user.roles).toContain('moderator')
        expect(options.overrideAccess).toBe(false)
        expect(options.context?.skipHooks).not.toBe(true)
      }
      const post = { ...previous, ...options.data }
      persisted.set(post.id, post)
      return post
    })
    const payload = {
      find: vi.fn(async () => ({ docs: existing })),
      update,
      findByID: vi.fn(async ({ id }) => persisted.get(id)),
    } as unknown as Payload

    await seedPosts(payload, users, subfeeds as Parameters<typeof seedPosts>[2], referenceNow)

    expect(persisted.get(content.get('malin-draft-vendor-comparison-pending')!.id)?.status).toBe(
      'pending',
    )
  })

  it('checks only manifest targets even when more than 500 unrelated feed items exist', async () => {
    const { content } = mockSeedFixtures()
    const find = vi.fn(async (options) => {
      const kind = options.collection === 'links' ? 'link' : 'post'
      expect(options.where).toEqual({
        and: [
          buildMainFeedWhere({ collection: options.collection }),
          {
            id: {
              in: [...content.values()]
                .filter((entry) => entry.kind === kind)
                .map((entry) => entry.id),
            },
          },
        ],
      })
      expect(options.pagination).toBe(false)
      return {
        docs: SEED_CONTENT_SCENARIOS.filter(
          (scenario) =>
            scenario.kind === kind &&
            (scenario.destination.feed === 'main' ||
              PROMOTED_EXPECTATIONS.has(scenario.expectation)),
        ).map((scenario) => ({ slug: scenario.key })),
        totalDocs: 601,
      }
    })

    await assertMainFeedVisibility({ payload: { find } as unknown as Payload, content })
    expect(find).toHaveBeenCalledTimes(2)
  })
})

describe.skipIf(process.env.SEED_VERIFY !== '1')(
  'Curated seed scenarios (#27)',
  { concurrent: false },
  () => {
    let payload: Payload
    let firstCounts: Record<CollectionSlug, number>
    let secondCounts: Record<CollectionSlug, number>
    let referenceNow: Date
    let outsiderUserId: number
    let outsiderLinkId: number

    beforeAll(async () => {
      payload = await getTestPayload()

      // A pre-existing, non-seed record that both seed runs must leave alone.
      const outsider = await createTestUser(payload)
      outsiderUserId = outsider.id
      const outsiderLink = await createTestLink(payload, outsider.id)
      outsiderLinkId = outsiderLink.id

      await runSeed(payload)
      firstCounts = await collectionCounts(payload)

      const secondRun = await runSeed(payload)
      referenceNow = secondRun.referenceNow
      secondCounts = await collectionCounts(payload)
    }, 900_000)

    it('adds zero rows on the second run and preserves unrelated records', async () => {
      expect(secondCounts).toEqual(firstCounts)

      const outsiderUser = await payload.findByID({
        collection: 'users',
        id: outsiderUserId,
        depth: 0,
        overrideAccess: true,
      })
      const outsiderLink = await payload.findByID({
        collection: 'links',
        id: outsiderLinkId,
        depth: 0,
        overrideAccess: true,
      })

      expect(outsiderUser).toBeTruthy()
      expect(outsiderLink).toBeTruthy()
    })

    it('creates the eight personas with their post-hook roles and standing', async () => {
      for (const persona of SEED_PERSONAS) {
        const user = await findUserByEmail(payload, persona.email)

        expect([...(user.roles ?? [])].sort()).toEqual([...persona.expectedRoles].sort())
        expect(user.trustLevel).toBe(persona.expectedTrustLevel)
      }
    })

    it('gives the newcomer a publicly readable personal feed and zero SubFeeds', async () => {
      const astrid = await findUserByEmail(payload, 'astrid@example.com')

      const { docs: subfeeds } = await payload.find({
        collection: 'subfeeds',
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })

      for (const subfeed of subfeeds) {
        const rosters = [
          ...readRelationIds(subfeed.moderators),
          ...readRelationIds(subfeed.editors),
          ...readRelationIds(subfeed.uploaders),
          ...readRelationIds(subfeed.members),
        ]

        expect(rosters).not.toContain(astrid.id)
        expect(subfeed.owner).not.toBe(astrid.id)
      }

      const publicLink = await payload.find({
        collection: 'links',
        where: { slug: { equals: 'astrid-personal-rss-setup' } },
        limit: 1,
        depth: 0,
        overrideAccess: false,
      })
      const publicPost = await payload.find({
        collection: 'posts',
        where: { slug: { equals: 'astrid-first-week-shipping-notes' } },
        limit: 1,
        depth: 0,
        overrideAccess: false,
      })

      expect(publicLink.docs).toHaveLength(1)
      expect(publicPost.docs).toHaveLength(1)
    })

    it('keeps the membership-only participant out of SubFeed publishing', async () => {
      const malin = await findUserByEmail(payload, 'malin@example.com')

      const { docs: nordic } = await payload.find({
        collection: 'subfeeds',
        where: { slug: { equals: 'nordic-indie-web' } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      expect(nordic).toHaveLength(1)
      expect(readRelationIds(nordic[0].members)).toContain(malin.id)
      expect(canSubmitToSubfeed(nordic[0], malin.id)).toBe(false)

      const linkItems = await payload.find({
        collection: 'links',
        where: { and: [{ user: { equals: malin.id } }, { feed: { equals: 'subfeed' } }] },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      const postItems = await payload.find({
        collection: 'posts',
        where: { and: [{ user: { equals: malin.id } }, { feed: { equals: 'subfeed' } }] },
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })

      expect(linkItems.docs).toHaveLength(0)
      expect(postItems.docs).toHaveLength(0)
    })

    it('lets the local uploader publish in one SubFeed but nowhere else', async () => {
      const linnea = await findUserByEmail(payload, 'linnea@example.com')

      const { docs: subfeeds } = await payload.find({
        collection: 'subfeeds',
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })

      const bySlug = new Map(subfeeds.map((subfeed) => [subfeed.slug, subfeed] as const))

      expect(canSubmitToSubfeed(bySlug.get('nordic-indie-web')!, linnea.id)).toBe(true)
      expect(canSubmitToSubfeed(bySlug.get('craft-design-systems')!, linnea.id)).toBe(false)
      expect(canSubmitToSubfeed(bySlug.get('applied-ai-notes')!, linnea.id)).toBe(false)
      expect(canManageSubmittedLinks(linnea)).toBe(false)
    })

    it('keeps promoted, unpromoted, pending, quarantined and controversial states distinct', async () => {
      const expectationsByKey = new Map<string, ContentScenarioExpectation>(
        SEED_CONTENT_SCENARIOS.map((scenario) => [scenario.key, scenario.expectation]),
      )

      for (const scenario of SEED_CONTENT_SCENARIOS) {
        const { docs } = await payload.find({
          collection: scenario.kind === 'link' ? 'links' : 'posts',
          where: { slug: { equals: scenario.key } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })

        expect(docs, `${scenario.key} should exist`).toHaveLength(1)

        const doc = docs[0]
        const promoted = PROMOTED_EXPECTATIONS.has(scenario.expectation)

        expect(doc.feed).toBe(scenario.destination.feed)
        expect(isEligibleForMainFeedPromotion(doc)).toBe(promoted)
      }

      expect(expectationsByKey.get('henrik-tabs-vs-spaces-css-reset')).toBe('controversial')
      expect(expectationsByKey.get('soren-disputed-benchmark-mirror')).toBe('quarantined')
      expect(expectationsByKey.get('astrid-sqlite-backup-notes')).toBe('personal-promoted')
    })

    it('surfaces exactly the promoted and native Main Feed items through the real filter', async () => {
      const [mainLinks, mainPosts] = await Promise.all([
        payload.find({
          collection: 'links',
          where: {
            and: [
              buildMainFeedWhere({ collection: 'links' }),
              {
                slug: {
                  in: SEED_CONTENT_SCENARIOS.filter((scenario) => scenario.kind === 'link').map(
                    (scenario) => scenario.key,
                  ),
                },
              },
            ],
          },
          pagination: false,
          depth: 0,
          overrideAccess: true,
        }),
        payload.find({
          collection: 'posts',
          where: {
            and: [
              buildMainFeedWhere({ collection: 'posts' }),
              {
                slug: {
                  in: SEED_CONTENT_SCENARIOS.filter((scenario) => scenario.kind === 'post').map(
                    (scenario) => scenario.key,
                  ),
                },
              },
            ],
          },
          pagination: false,
          depth: 0,
          overrideAccess: true,
        }),
      ])

      const visible = {
        link: new Set(mainLinks.docs.map((doc) => doc.slug).filter(Boolean)),
        post: new Set(mainPosts.docs.map((doc) => doc.slug).filter(Boolean)),
      }

      for (const scenario of SEED_CONTENT_SCENARIOS) {
        const expected =
          scenario.destination.feed === 'main' || PROMOTED_EXPECTATIONS.has(scenario.expectation)

        expect(
          visible[scenario.kind].has(scenario.key),
          `${scenario.key} Main Feed visibility should be ${expected}`,
        ).toBe(expected)
      }

      const publicQuarantined = await payload.find({
        collection: 'links',
        where: { slug: { equals: 'soren-disputed-benchmark-mirror' } },
        limit: 1,
        depth: 0,
        overrideAccess: false,
      })
      const publicPending = await payload.find({
        collection: 'posts',
        where: { slug: { equals: 'malin-draft-vendor-comparison-pending' } },
        limit: 1,
        depth: 0,
        overrideAccess: false,
      })
      const malin = await findUserByEmail(payload, 'malin@example.com')
      const ownerPending = await payload.find({
        collection: 'posts',
        where: { slug: { equals: 'malin-draft-vendor-comparison-pending' } },
        limit: 1,
        depth: 0,
        user: malin,
        overrideAccess: false,
      })
      const publicControversial = await payload.find({
        collection: 'links',
        where: { slug: { equals: 'henrik-tabs-vs-spaces-css-reset' } },
        limit: 1,
        depth: 0,
        overrideAccess: false,
      })

      expect(publicQuarantined.docs).toHaveLength(0)
      expect(publicPending.docs).toHaveLength(0)
      expect(ownerPending.docs).toHaveLength(1)
      expect(publicControversial.docs).toHaveLength(1)
    })

    it('tracks active and expired editorial priority honestly', async () => {
      const activeScenarios = SEED_CONTENT_SCENARIOS.filter(
        (scenario) =>
          scenario.expectation === 'main-editorial' &&
          'editorialPriorityOffsetHours' in scenario &&
          (scenario.editorialPriorityOffsetHours ?? 0) > 0,
      )
      const expiredScenarios = SEED_CONTENT_SCENARIOS.filter(
        (scenario) =>
          scenario.expectation === 'main-editorial' &&
          'editorialPriorityOffsetHours' in scenario &&
          (scenario.editorialPriorityOffsetHours ?? 0) < 0,
      )

      expect(activeScenarios.length).toBeGreaterThan(0)
      expect(expiredScenarios.length).toBeGreaterThan(0)

      for (const scenario of [...activeScenarios, ...expiredScenarios]) {
        const { docs } = await payload.find({
          collection: scenario.kind === 'link' ? 'links' : 'posts',
          where: { slug: { equals: scenario.key } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })

        const until = docs[0]?.editorialPriorityUntil
        expect(until).toBeTruthy()
        expect(docs[0]?.editorialPriority).toBe(true)

        const isActive = new Date(until as string).getTime() > referenceNow.getTime()
        const expectedActive =
          'editorialPriorityOffsetHours' in scenario &&
          (scenario.editorialPriorityOffsetHours ?? 0) > 0

        expect(isActive).toBe(expectedActive)
      }
    })

    it('restores a removed seeded reply to visible without replacing it on reseed', async () => {
      const kalle = await findUserByEmail(payload, 'kalle@example.com')
      const astrid = await findUserByEmail(payload, 'astrid@example.com')
      const scenario = SEED_INTERACTION_SCENARIOS.find(
        (item) => item.key === 'comment:astrid-personal-rss-setup:astrid',
      )!
      const { docs: links } = await payload.find({
        collection: 'links',
        where: { slug: { equals: scenario.target } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      expect(links).toHaveLength(1)

      const where: Where = {
        and: [
          { link: { equals: links[0].id } },
          { user: { equals: astrid.id } },
          { parentComment: { exists: true } },
        ],
      }
      const { docs: replies } = await payload.find({
        collection: 'comments',
        where,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      expect(replies).toHaveLength(1)
      const reply = replies[0]
      expect(reply.comment).toEqual(asLexicalRichText(scenario.text!))
      expect(reply.moderationStatus).toBe('visible')

      await payload.update({
        collection: 'comments',
        id: reply.id,
        data: { moderationStatus: 'removed' },
        user: kalle,
        overrideAccess: false,
      })
      const removed = await payload.findByID({
        collection: 'comments',
        id: reply.id,
        depth: 0,
        user: kalle,
        overrideAccess: false,
      })
      expect(removed.moderationStatus).toBe('removed')

      await runSeed(payload, { referenceNow })

      const restored = await payload.findByID({
        collection: 'comments',
        id: reply.id,
        depth: 0,
        overrideAccess: false,
      })
      expect(restored.moderationStatus).toBe('visible')
      expect(restored.user).toBe(reply.user)
      expect(restored.parentComment).toBe(reply.parentComment)
      expect(restored.comment).toEqual(reply.comment)
      expect(
        (await payload.count({ collection: 'comments', where, overrideAccess: true })).totalDocs,
      ).toBe(1)
    }, 900_000)

    it('restores a published seeded pending post to pending on reseed', async () => {
      const kalle = await findUserByEmail(payload, 'kalle@example.com')
      const malin = await findUserByEmail(payload, 'malin@example.com')
      const where: Where = { slug: { equals: 'malin-draft-vendor-comparison-pending' } }
      const { docs: posts } = await payload.find({
        collection: 'posts',
        where,
        limit: 1,
        depth: 0,
        user: kalle,
        overrideAccess: false,
      })
      expect(posts).toHaveLength(1)
      const post = posts[0]
      expect(post.status).toBe('pending')

      await payload.update({
        collection: 'posts',
        id: post.id,
        data: { status: 'published' },
        user: kalle,
        overrideAccess: false,
      })
      const published = await payload.findByID({
        collection: 'posts',
        id: post.id,
        depth: 0,
        overrideAccess: false,
      })
      expect(published.status).toBe('published')

      await runSeed(payload, { referenceNow })

      const restored = await payload.findByID({
        collection: 'posts',
        id: post.id,
        depth: 0,
        user: malin,
        overrideAccess: false,
      })
      expect(restored.status).toBe('pending')
      expect(restored.user).toBe(post.user)
      expect(restored.slug).toBe(post.slug)
      const publicPosts = await payload.find({
        collection: 'posts',
        where,
        depth: 0,
        overrideAccess: false,
      })
      expect(publicPosts.docs).toHaveLength(0)
      expect(
        (await payload.count({ collection: 'posts', where, overrideAccess: true })).totalDocs,
      ).toBe(1)
    }, 900_000)
  },
)
