import { Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'
import { faker } from '@faker-js/faker'

import { getTestPayload } from '../utils/test-user'
import { createFeedItem, createRichText, createTestUser } from './helpers'
import {
  buildCollectionReadAccessWhere,
  buildPublicFeedVisibilityWhere,
  buildPublishedAndSafeWhere,
  isItemVisibleInPublicFeed,
  viewerAllowsNSFW,
} from '@/lib/community/visibility'
import { buildTrendingSignalWhere, isTrendingSignalItem } from '@/lib/community/promotion'
import type { PromotableItemLike } from '@/lib/community/promotion'
import type { VisibleItemLike } from '@/lib/community/visibility'

let payload: Payload

const unique = () => faker.string.alphanumeric(10).toLowerCase()

type LinkInput = {
  user: number
  tag?: string
  feed?: 'main' | 'user' | 'subfeed'
  subfeedId?: number
  upvotes?: number
  downvotes?: number
  featured?: boolean
  discoveryBoosted?: boolean
  softDeleted?: boolean
  quarantined?: boolean
  nsfw?: boolean
  status?: 'published' | 'draft'
  /** Admin actor, used when creating moderator-only fields (e.g. discoveryBoosted). */
  actor?: unknown
}

const createLink = async (input: LinkInput) => {
  const draft = input.status === 'draft'
  return createFeedItem(payload, {
    collection: 'links',
    user: input.user,
    feed: input.feed ?? 'user',
    subfeedId: input.subfeedId,
    state: input.softDeleted
      ? 'soft-deleted'
      : input.quarantined
        ? 'quarantined'
        : draft
          ? 'draft'
          : 'published',
    titlePrefix: 'Visibility',
    signals: {
      upvotes: input.upvotes,
      downvotes: input.downvotes,
      featured: input.featured,
      discoveryBoosted: input.discoveryBoosted,
      nsfw: input.nsfw,
      tags: input.tag ? [input.tag] : undefined,
      actor: input.actor,
    },
  })
}

type PostInput = {
  user: number
  tag?: string
  feed?: 'main' | 'user' | 'subfeed'
  subfeedId?: number
  upvotes?: number
  downvotes?: number
  featured?: boolean
  discoveryBoosted?: boolean
  quarantined?: boolean
  nsfw?: boolean
  status?: 'published' | 'pending' | 'removed'
  /** Admin actor, used when creating moderator-only fields (e.g. discoveryBoosted). */
  actor?: unknown
}

const createPost = async (input: PostInput) => {
  const status = input.status ?? 'published'
  return createFeedItem(payload, {
    collection: 'posts',
    user: input.user,
    feed: input.feed ?? 'user',
    subfeedId: input.subfeedId,
    state: input.quarantined ? 'quarantined' : status,
    titlePrefix: 'Visibility',
    signals: {
      upvotes: input.upvotes,
      downvotes: input.downvotes,
      featured: input.featured,
      discoveryBoosted: input.discoveryBoosted,
      nsfw: input.nsfw,
      tags: input.tag ? [input.tag] : undefined,
      actor: input.actor,
    },
  })
}

const createAdmin = async () => {
  const user = await createTestUser(payload)
  await payload.update({
    collection: 'users',
    id: user.id,
    data: { roles: ['admin', 'user'] },
    overrideAccess: true,
  })
  return payload.findByID({ collection: 'users', id: user.id, overrideAccess: true })
}

type DocLike = { id: number } & VisibleItemLike & PromotableItemLike

const findDocs = async (
  collection: 'links' | 'posts',
  where: Record<string, unknown>,
): Promise<DocLike[]> => {
  const { docs } = await payload.find({
    collection,
    where: where as never,
    overrideAccess: true,
    draft: collection === 'links',
    limit: 100,
    depth: 0,
  })
  return docs as DocLike[]
}

const matchesBuiltAccessWhere = async (
  collection: 'links' | 'posts',
  viewer: Parameters<typeof buildCollectionReadAccessWhere>[1],
  id: number,
): Promise<boolean> => {
  const access = buildCollectionReadAccessWhere(collection, viewer)
  if (access === true) return true

  const docs = await findDocs(collection, { and: [{ id: { equals: id } }, access] })
  return docs.length > 0
}

describe('Content visibility policy (pure)', () => {
  it('resolves the viewer NSFW preference', () => {
    expect(viewerAllowsNSFW(null)).toBe(false)
    expect(viewerAllowsNSFW(undefined)).toBe(false)
    expect(viewerAllowsNSFW({})).toBe(false)
    expect(viewerAllowsNSFW({ settings: null })).toBe(false)
    expect(viewerAllowsNSFW({ settings: { nsfw: false } })).toBe(false)
    expect(viewerAllowsNSFW({ settings: { nsfw: true } })).toBe(true)
  })

  it('builds published-and-safe filters for each collection', () => {
    expect(buildPublishedAndSafeWhere('links')).toEqual([
      { _status: { equals: 'published' } },
      { softDeleted: { not_equals: true } },
      { quarantined: { not_equals: true } },
    ])
    expect(buildPublishedAndSafeWhere('posts')).toEqual([
      { status: { equals: 'published' } },
      { status: { not_equals: 'removed' } },
      { quarantined: { not_equals: true } },
    ])
    // Defaults to links.
    expect(buildPublishedAndSafeWhere()).toEqual(buildPublishedAndSafeWhere('links'))
  })

  it('adds the NSFW exclusion unless explicitly included or the viewer opted in', () => {
    expect(buildPublicFeedVisibilityWhere()).toEqual([
      ...buildPublishedAndSafeWhere('links'),
      { nsfw: { not_equals: true } },
    ])
    expect(buildPublicFeedVisibilityWhere({ collection: 'posts' })).toEqual([
      ...buildPublishedAndSafeWhere('posts'),
      { nsfw: { not_equals: true } },
    ])
    expect(buildPublicFeedVisibilityWhere({ viewer: { id: 1, settings: { nsfw: true } } })).toEqual(
      buildPublishedAndSafeWhere('links'),
    )
    expect(
      buildPublicFeedVisibilityWhere({
        viewer: { id: 1, settings: { nsfw: true } },
        includeNSFW: false,
      }),
    ).toEqual([...buildPublishedAndSafeWhere('links'), { nsfw: { not_equals: true } }])
    expect(
      buildPublicFeedVisibilityWhere({
        viewer: { id: 1, settings: { nsfw: false } },
        includeNSFW: true,
      }),
    ).toEqual(buildPublishedAndSafeWhere('links'))
  })

  it('decides link visibility in memory', () => {
    const published = { _status: 'published', softDeleted: false, quarantined: false }
    expect(isItemVisibleInPublicFeed(published)).toBe(true)
    expect(isItemVisibleInPublicFeed({ ...published, _status: 'draft' })).toBe(false)
    expect(isItemVisibleInPublicFeed({ ...published, softDeleted: true })).toBe(false)
    expect(isItemVisibleInPublicFeed({ ...published, quarantined: true })).toBe(false)
    expect(isItemVisibleInPublicFeed({ ...published, nsfw: true })).toBe(false)
    expect(
      isItemVisibleInPublicFeed(
        { ...published, nsfw: true },
        { viewer: { settings: { nsfw: true } } },
      ),
    ).toBe(true)
    expect(isItemVisibleInPublicFeed({ ...published, nsfw: true }, { includeNSFW: true })).toBe(
      true,
    )
  })

  it('decides post visibility in memory', () => {
    const published = { status: 'published', quarantined: false }
    expect(isItemVisibleInPublicFeed(published, { collection: 'posts' })).toBe(true)
    expect(
      isItemVisibleInPublicFeed({ ...published, status: 'pending' }, { collection: 'posts' }),
    ).toBe(false)
    expect(
      isItemVisibleInPublicFeed({ ...published, status: 'removed' }, { collection: 'posts' }),
    ).toBe(false)
    expect(
      isItemVisibleInPublicFeed({ ...published, quarantined: true }, { collection: 'posts' }),
    ).toBe(false)
    expect(isItemVisibleInPublicFeed({ ...published, nsfw: true }, { collection: 'posts' })).toBe(
      false,
    )
    expect(
      isItemVisibleInPublicFeed(
        { ...published, nsfw: true },
        { collection: 'posts', viewer: { settings: { nsfw: true } } },
      ),
    ).toBe(true)
  })

  it('builds guest read access from published-and-safe filters', () => {
    expect(buildCollectionReadAccessWhere('links', null)).toEqual({
      and: buildPublishedAndSafeWhere('links'),
    })
    expect(buildCollectionReadAccessWhere('posts', undefined)).toEqual({
      and: buildPublishedAndSafeWhere('posts'),
    })
  })

  it('grants moderators unconditional read access', () => {
    expect(buildCollectionReadAccessWhere('links', { id: 1, roles: ['moderator'] })).toBe(true)
    expect(buildCollectionReadAccessWhere('posts', { id: 1, roles: ['editor'] })).toBe(true)
    expect(buildCollectionReadAccessWhere('links', { id: 1, roles: ['admin'] })).toBe(true)
  })

  it('builds authenticated non-moderator read access per collection', () => {
    expect(buildCollectionReadAccessWhere('links', { id: 7, roles: ['user'] })).toEqual({
      and: [
        { softDeleted: { not_equals: true } },
        { quarantined: { not_equals: true } },
        {
          or: [{ _status: { equals: 'published' } }, { user: { equals: 7 } }],
        },
      ],
    })

    expect(buildCollectionReadAccessWhere('posts', { id: 7, roles: ['user'] })).toEqual({
      and: [
        { quarantined: { not_equals: true } },
        { status: { not_equals: 'removed' } },
        {
          or: [
            { status: { equals: 'published' } },
            {
              and: [{ status: { equals: 'pending' } }, { user: { equals: 7 } }],
            },
          ],
        },
      ],
    })
  })
})

describe('Trending signal policy (pure)', () => {
  const organicSignals = {
    feed: 'user' as const,
    _status: 'published',
    score: 20,
    upvotes: 20,
    rankingScore: 128,
    engagementVelocity: 10,
  }

  it('accepts featured, discovery-boosted, and organic items', () => {
    expect(isTrendingSignalItem({ ...organicSignals, featured: true })).toBe(true)
    expect(isTrendingSignalItem({ ...organicSignals, discoveryBoosted: true })).toBe(true)
    expect(isTrendingSignalItem(organicSignals)).toBe(true)
    // Main-feed origin uses the same (non-discounted) threshold.
    expect(isTrendingSignalItem({ ...organicSignals, feed: 'main' })).toBe(true)
  })

  it('uses the discounted SubFeed threshold', () => {
    const subfeedSignals = {
      _status: 'published',
      feed: 'subfeed' as const,
      score: 4,
      upvotes: 4,
      rankingScore: 76,
      discoveryMomentum: 6,
    }
    expect(isTrendingSignalItem(subfeedSignals)).toBe(true)
    expect(isTrendingSignalItem({ ...subfeedSignals, feed: 'user' })).toBe(false)
  })

  it('rejects organic threshold items without momentum', () => {
    expect(
      isTrendingSignalItem({
        ...organicSignals,
        discoveryMomentum: 0,
        engagementVelocity: 0,
      }),
    ).toBe(false)
    expect(isTrendingSignalItem({ ...organicSignals, engagementVelocity: 2.5 })).toBe(false)
  })

  it('lets safety exclusions win over every branch', () => {
    for (const override of [
      { featured: true },
      { discoveryBoosted: true },
      { featured: true, discoveryBoosted: true },
    ]) {
      expect(isTrendingSignalItem({ ...organicSignals, ...override, controversial: true })).toBe(
        false,
      )
      expect(isTrendingSignalItem({ ...organicSignals, ...override, quarantined: true })).toBe(
        false,
      )
      expect(isTrendingSignalItem({ ...organicSignals, ...override, softDeleted: true })).toBe(
        false,
      )
      expect(isTrendingSignalItem({ ...organicSignals, ...override, status: 'removed' })).toBe(
        false,
      )
      expect(isTrendingSignalItem({ ...organicSignals, ...override, _status: 'draft' })).toBe(false)
    }
  })

  it('builds the Payload where fragment matching the pure predicate', () => {
    expect(buildTrendingSignalWhere()).toEqual({
      and: [
        ...buildPublishedAndSafeWhere('links'),
        { controversial: { not_equals: true } },
        {
          or: [
            { featured: { equals: true } },
            { discoveryBoosted: { equals: true } },
            {
              and: [
                { feed: { equals: 'subfeed' } },
                {
                  and: [
                    { score: { greater_than_equal: 3 } },
                    { upvotes: { greater_than_equal: 4 } },
                    { rankingScore: { greater_than_equal: 75 } },
                    {
                      or: [
                        { discoveryMomentum: { greater_than_equal: 5 } },
                        { engagementVelocity: { greater_than_equal: 5 } },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              and: [
                { feed: { not_equals: 'subfeed' } },
                {
                  and: [
                    { score: { greater_than_equal: 4 } },
                    { upvotes: { greater_than_equal: 5 } },
                    { rankingScore: { greater_than_equal: 100 } },
                    {
                      or: [
                        { discoveryMomentum: { greater_than_equal: 5 } },
                        { engagementVelocity: { greater_than_equal: 5 } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })

    expect(buildTrendingSignalWhere({ collection: 'posts' })).toEqual({
      and: [
        ...buildPublishedAndSafeWhere('posts'),
        { controversial: { not_equals: true } },
        expect.objectContaining({ or: expect.any(Array) }),
      ],
    })
  })
})

describe('Content visibility policy (integration)', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('agrees with the public feed predicate for links', async () => {
    const author = await createTestUser(payload)
    const admin = await createAdmin()
    const tag = `visibility-links-${unique()}`

    const published = await createLink({ user: author.id, tag })
    const draft = await createLink({ user: author.id, tag, status: 'draft' })
    const softDeleted = await createLink({ user: author.id, tag, softDeleted: true })
    const quarantined = await createLink({ user: author.id, tag, quarantined: true })
    const nsfw = await createLink({ user: author.id, tag, nsfw: true })

    const all = await findDocs('links', { tags: { equals: tag } })
    const expected = all.filter((item) => isItemVisibleInPublicFeed(item)).map((item) => item.id)
    const actual = (
      await findDocs('links', {
        and: [{ tags: { equals: tag } }, { and: buildPublicFeedVisibilityWhere() }],
      })
    ).map((item) => item.id)

    expect(new Set(actual)).toEqual(new Set([published.id]))
    expect(new Set(expected)).toEqual(new Set(actual))
    expect(actual).not.toContain(draft.id)
    expect(actual).not.toContain(softDeleted.id)
    expect(actual).not.toContain(quarantined.id)
    expect(actual).not.toContain(nsfw.id)

    // A viewer who opted into NSFW sees the NSFW item too.
    const nsfwOptIn = await findDocs('links', {
      and: [
        { tags: { equals: tag } },
        { and: buildPublicFeedVisibilityWhere({ viewer: { settings: { nsfw: true } } }) },
      ],
    })
    expect(nsfwOptIn.map((item) => item.id)).toContain(nsfw.id)
    // The admin actor is only used to exercise moderator-only fields elsewhere.
    expect(admin.id).toBeDefined()
  })

  it('agrees with the public feed predicate for posts', async () => {
    const author = await createTestUser(payload)
    const tag = `visibility-posts-${unique()}`

    const published = await createPost({ user: author.id, tag })
    const pending = await createPost({ user: author.id, tag, status: 'pending' })
    const removed = await createPost({ user: author.id, tag, status: 'removed' })
    const quarantined = await createPost({ user: author.id, tag, quarantined: true })
    const nsfw = await createPost({ user: author.id, tag, nsfw: true })

    const all = await findDocs('posts', { tags: { equals: tag } })
    const expected = all
      .filter((item) => isItemVisibleInPublicFeed(item, { collection: 'posts' }))
      .map((item) => item.id)
    const actual = (
      await findDocs('posts', {
        tags: { equals: tag },
        and: buildPublicFeedVisibilityWhere({ collection: 'posts' }),
      })
    ).map((item) => item.id)

    expect(new Set(actual)).toEqual(new Set([published.id]))
    expect(new Set(expected)).toEqual(new Set(actual))
    expect(actual).not.toContain(pending.id)
    expect(actual).not.toContain(removed.id)
    expect(actual).not.toContain(quarantined.id)
    expect(actual).not.toContain(nsfw.id)
  })

  it('builds guest, member, and moderator read access for links', async () => {
    const author = await createTestUser(payload)
    const other = await createTestUser(payload)
    const moderator = await createAdmin()

    const published = await createLink({ user: author.id })
    const ownDraft = await createLink({ user: author.id, status: 'draft' })
    const othersDraft = await createLink({ user: other.id, status: 'draft' })
    const softDeleted = await createLink({ user: author.id, softDeleted: true })
    const quarantined = await createLink({ user: author.id, quarantined: true })

    // Guest
    expect(await matchesBuiltAccessWhere('links', null, published.id)).toBe(true)
    expect(await matchesBuiltAccessWhere('links', null, ownDraft.id)).toBe(false)
    expect(await matchesBuiltAccessWhere('links', null, softDeleted.id)).toBe(false)

    // Authenticated non-moderator
    const member = { id: author.id, roles: ['user'] }
    expect(await matchesBuiltAccessWhere('links', member, published.id)).toBe(true)
    expect(await matchesBuiltAccessWhere('links', member, ownDraft.id)).toBe(true)
    expect(await matchesBuiltAccessWhere('links', member, othersDraft.id)).toBe(false)
    expect(await matchesBuiltAccessWhere('links', member, softDeleted.id)).toBe(false)
    expect(await matchesBuiltAccessWhere('links', member, quarantined.id)).toBe(false)

    // Moderator
    for (const id of [published.id, ownDraft.id, othersDraft.id, softDeleted.id, quarantined.id]) {
      expect(
        await matchesBuiltAccessWhere('links', { id: moderator.id, roles: ['admin'] }, id),
      ).toBe(true)
    }
  })

  it('builds guest, member, and moderator read access for posts', async () => {
    const author = await createTestUser(payload)
    const other = await createTestUser(payload)
    const moderator = await createAdmin()

    const published = await createPost({ user: author.id })
    const ownPending = await createPost({ user: author.id, status: 'pending' })
    const othersPending = await createPost({ user: other.id, status: 'pending' })
    const removed = await createPost({ user: author.id, status: 'removed' })
    const quarantined = await createPost({ user: author.id, quarantined: true })

    // Guest
    expect(await matchesBuiltAccessWhere('posts', null, published.id)).toBe(true)
    expect(await matchesBuiltAccessWhere('posts', null, ownPending.id)).toBe(false)
    expect(await matchesBuiltAccessWhere('posts', null, removed.id)).toBe(false)

    // Authenticated non-moderator
    const member = { id: author.id, roles: ['user'] }
    expect(await matchesBuiltAccessWhere('posts', member, published.id)).toBe(true)
    expect(await matchesBuiltAccessWhere('posts', member, ownPending.id)).toBe(true)
    expect(await matchesBuiltAccessWhere('posts', member, othersPending.id)).toBe(false)
    expect(await matchesBuiltAccessWhere('posts', member, removed.id)).toBe(false)
    expect(await matchesBuiltAccessWhere('posts', member, quarantined.id)).toBe(false)

    // Moderator
    for (const id of [published.id, ownPending.id, othersPending.id, removed.id, quarantined.id]) {
      expect(
        await matchesBuiltAccessWhere('posts', { id: moderator.id, roles: ['admin'] }, id),
      ).toBe(true)
    }
  })

  it('delegates collection readAccess to the shared visibility policy', async () => {
    const author = await createTestUser(payload)
    const reader = await createTestUser(payload)
    const moderator = await createAdmin()

    const published = await createLink({ user: author.id })
    const quarantined = await createLink({ user: author.id, quarantined: true })

    const guestVisible = await payload.find({
      collection: 'links',
      where: { id: { equals: published.id } },
      overrideAccess: false,
    })
    expect(guestVisible.docs).toHaveLength(1)

    const guestQuarantined = await payload.find({
      collection: 'links',
      where: { id: { equals: quarantined.id } },
      overrideAccess: false,
    })
    expect(guestQuarantined.docs).toHaveLength(0)

    const memberQuarantined = await payload.find({
      collection: 'links',
      where: { id: { equals: quarantined.id } },
      user: reader,
      overrideAccess: false,
    })
    expect(memberQuarantined.docs).toHaveLength(0)

    const moderatorQuarantined = await payload.find({
      collection: 'links',
      where: { id: { equals: quarantined.id } },
      user: moderator,
      overrideAccess: false,
    })
    expect(moderatorQuarantined.docs).toHaveLength(1)
  })
})

describe('Trending signal policy (integration)', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it.each(['links', 'posts'] as const)(
    'agrees with buildTrendingSignalWhere for %s',
    async (collection) => {
      const author = await createTestUser(payload)
      const admin = await createAdmin()
      const tag = `trending-${collection}-${unique()}`
      const createItem = async (input: {
        user: number
        tag?: string
        feed?: 'main' | 'user' | 'subfeed'
        subfeedId?: number
        upvotes?: number
        downvotes?: number
        featured?: boolean
        discoveryBoosted?: boolean
        quarantined?: boolean
        nsfw?: boolean
        actor?: unknown
      }) => (collection === 'links' ? createLink(input) : createPost(input))

      const items = [
        await createItem({ user: author.id, tag, featured: true, actor: admin }),
        await createItem({ user: author.id, tag, discoveryBoosted: true, actor: admin }),
        await createItem({ user: author.id, tag, upvotes: 20 }),
        // Organic signals clear the engagement thresholds but momentum stays
        // below the 5.0 gate (engagementVelocity = 5 / 2 = 2.5).
        await createItem({ user: author.id, tag, upvotes: 5 }),
        await createItem({ user: author.id, tag, upvotes: 10, downvotes: 10, featured: true }),
        await createItem({ user: author.id, tag, featured: true, quarantined: true }),
        collection === 'links'
          ? await createLink({ user: author.id, tag, featured: true, softDeleted: true })
          : await createPost({ user: author.id, tag, featured: true, status: 'removed' }),
        collection === 'links'
          ? await createLink({ user: author.id, tag, featured: true, status: 'draft' })
          : await createPost({ user: author.id, tag, featured: true, status: 'pending' }),
        await createItem({ user: author.id, tag }),
      ]

      const all = await findDocs(collection, { tags: { equals: tag } })
      const expected = all
        .filter((item) => isTrendingSignalItem(item))
        .map((item) => item.id)
        .sort()

      const actual = (
        await findDocs(collection, {
          and: [{ tags: { equals: tag } }, buildTrendingSignalWhere({ collection })],
        })
      )
        .map((item) => item.id)
        .sort()

      expect(actual).toEqual(expected)
      expect(actual).toContain(items[0].id) // featured
      expect(actual).toContain(items[1].id) // discovery boosted
      expect(actual).toContain(items[2].id) // organic with momentum
      expect(actual).not.toContain(items[3].id) // momentum below gate
      expect(actual).not.toContain(items[4].id) // controversial
      expect(actual).not.toContain(items[5].id) // quarantined
      expect(actual).not.toContain(items[6].id) // removed / soft-deleted
      expect(actual).not.toContain(items[7].id) // unpublished
    },
  )
})
