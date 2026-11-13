import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { getTestPayload } from '../utils/test-user'
import { createTestLink, createTestUser } from './helpers'
import { runSeed } from '@/scripts/seed/seed'
import {
  PROMOTED_EXPECTATIONS,
  SEED_CONTENT_SCENARIOS,
  SEED_PERSONAS,
  readRelationIds,
  type ContentScenarioExpectation,
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
  const entries = await Promise.all(
    COLLECTIONS.map(async (collection) => {
      const result = await payload.count({ collection, overrideAccess: true })
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

describe.skipIf(process.env.SEED_VERIFY !== '1')('Curated seed scenarios (#27)', () => {
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
        where: buildMainFeedWhere({ collection: 'links' }),
        limit: 500,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'posts',
        where: buildMainFeedWhere({ collection: 'posts' }),
        limit: 500,
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
})
