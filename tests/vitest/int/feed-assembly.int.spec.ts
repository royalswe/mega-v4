import { Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'
import { faker } from '@faker-js/faker'

import { getTestPayload } from '../utils/test-user'
import { createFeedItem, createRichText, createSubfeedWithRoster, createTestUser } from './helpers'
import {
  MODE_SORT_BY,
  buildHomeFeedBaseWhere,
  buildHomeFeedWhere,
  buildSubfeedContentWhere,
  buildTrendBucketLabels,
  buildTrendPoints,
  extractTrendingTopics,
  hydrateFeedCardRelations,
  loadHomeFeed,
  loadSubfeedFeed,
  mapRoster,
  mergeAndSortSubfeedItems,
  parseContentFilter,
  parseHomeSubfeedsView,
  parseMode,
  parsePulseWindow,
  parseSignal,
  toTrendDirection,
} from '@/lib/community/feedAssembly'
import { buildMainFeedWhere, buildTrendingSignalWhere } from '@/lib/community/promotion'
import { buildPublicFeedVisibilityWhere } from '@/lib/community/visibility'
import type { Link as LinkDoc, Post as PostDoc, Subfeed, User } from '@/payload-types'

let payload: Payload

const unique = () => faker.string.alphanumeric(10).toLowerCase()

const createSubfeed = async (userId: number): Promise<Subfeed> =>
  createSubfeedWithRoster(payload, { ownerId: userId, prefix: 'feed-assembly' })

type LinkInput = {
  user: number
  feed?: 'main' | 'user' | 'subfeed'
  subfeedId?: number
  upvotes?: number
  featured?: boolean
  softDeleted?: boolean
  quarantined?: boolean
  nsfw?: boolean
  tag?: string
  status?: 'published' | 'draft'
}

const createLink = async (input: LinkInput): Promise<LinkDoc> =>
  createFeedItem(payload, {
    collection: 'links',
    user: input.user,
    feed: input.feed,
    subfeedId: input.subfeedId,
    state: input.softDeleted
      ? 'soft-deleted'
      : input.quarantined
        ? 'quarantined'
        : input.status === 'draft'
          ? 'draft'
          : 'published',
    titlePrefix: 'Feed Assembly',
    signals: {
      upvotes: input.upvotes,
      featured: input.featured,
      nsfw: input.nsfw,
      tags: input.tag ? [input.tag] : undefined,
    },
  }) as unknown as Promise<LinkDoc>

type PostInput = {
  user: number
  feed?: 'main' | 'user' | 'subfeed'
  subfeedId?: number
  upvotes?: number
  featured?: boolean
  quarantined?: boolean
  nsfw?: boolean
  tag?: string
  status?: 'published' | 'pending' | 'removed'
}

const createPost = async (input: PostInput): Promise<PostDoc> =>
  createFeedItem(payload, {
    collection: 'posts',
    user: input.user,
    feed: input.feed,
    subfeedId: input.subfeedId,
    state: input.quarantined ? 'quarantined' : (input.status ?? 'published'),
    titlePrefix: 'Feed Assembly',
    signals: {
      upvotes: input.upvotes,
      featured: input.featured,
      nsfw: input.nsfw,
      tags: input.tag ? [input.tag] : undefined,
    },
  }) as unknown as Promise<PostDoc>

const asLinkDoc = (doc: Record<string, unknown>) => doc as unknown as LinkDoc
const asPostDoc = (doc: Record<string, unknown>) => doc as unknown as PostDoc

describe('feed assembly pure helpers', () => {
  it('parses the feed URL parameters', () => {
    expect(parseSignal('trending')).toBe('trending')
    expect(parseSignal('subfeeds')).toBe('subfeeds')
    expect(parseSignal('discussions')).toBe('discussions')
    expect(parseSignal('nope')).toBeNull()
    expect(parseSignal(undefined)).toBeNull()

    expect(parseMode('new')).toBe('new')
    expect(parseMode('rising')).toBe('rising')
    expect(parseMode('best')).toBe('best')
    expect(parseMode(undefined)).toBe('best')

    expect(parseHomeSubfeedsView('joined')).toBe('joined')
    expect(parseHomeSubfeedsView('trending')).toBe('trending')
    expect(parseHomeSubfeedsView(undefined)).toBe('trending')

    expect(parsePulseWindow('7d')).toBe('7d')
    expect(parsePulseWindow(['7d'])).toBe('7d')
    expect(parsePulseWindow('24h')).toBe('24h')
    expect(parsePulseWindow(undefined)).toBe('24h')

    expect(parseContentFilter('links')).toBe('links')
    expect(parseContentFilter(['posts'])).toBe('posts')
    expect(parseContentFilter('all')).toBe('all')
    expect(parseContentFilter(undefined)).toBe('all')

    expect(MODE_SORT_BY).toEqual({
      best: '-rankingScore',
      new: '-createdAt',
      rising: '-engagementVelocity',
    })
  })

  it('computes a trend direction from two counts', () => {
    expect(toTrendDirection(10, 5)).toBe(1)
    expect(toTrendDirection(4, 9)).toBe(-1)
    expect(toTrendDirection(7, 7)).toBe(0)
  })

  it('extracts trending topics by frequency then label', () => {
    expect(
      extractTrendingTopics([
        { tags: ['solo'] },
        { tags: ['solo', 'duo'] },
        { tags: ['duo'] },
        { tags: ['trio', '  Duo  '] },
        { tags: null },
      ]),
    ).toEqual(['duo', 'solo', 'trio'])

    expect(
      extractTrendingTopics(
        Array.from({ length: 7 }, (_, index) => ({ tags: [`topic-${index}`] })),
      ),
    ).toHaveLength(5)
  })

  it('maps SubFeed roster relationships to display members', () => {
    expect(
      mapRoster([
        { id: 1, username: 'ana' },
        2,
        { id: '3' },
        { id: 4, username: null },
        {},
        null,
        'not-a-user',
      ]),
    ).toEqual([
      { id: 1, username: 'ana' },
      { id: 2, username: 'User #2' },
      { id: 3, username: 'User #3' },
      { id: 4, username: 'User #4' },
    ])
    expect(mapRoster(undefined)).toEqual([])
  })

  it('buckets trend points and labels into the selected window', () => {
    const now = Date.parse('2026-01-02T12:00:00.000Z')
    const points = buildTrendPoints(
      [
        new Date(now - 1_000).toISOString(),
        new Date(now - 25 * 60 * 60 * 1000).toISOString(),
        'not-a-date',
      ],
      now,
      '24h',
    )

    expect(points).toHaveLength(8)
    expect(points.reduce((total, value) => total + value, 0)).toBe(1)
    expect(points[7]).toBe(1)

    const weekPoints = buildTrendPoints([new Date(now - 1_000).toISOString()], now, '7d')
    expect(weekPoints).toHaveLength(7)
    expect(weekPoints[6]).toBe(1)

    expect(buildTrendBucketLabels(now, '24h', 'en')).toHaveLength(8)
    expect(buildTrendBucketLabels(now, '7d', 'en')).toHaveLength(7)
    expect(buildTrendBucketLabels(now, '24h', 'sv')[0]).not.toHaveLength(0)
  })

  it('merges links and posts by ranking score then recency', () => {
    const now = Date.now()
    const links = [
      asLinkDoc({ id: 1, rankingScore: 10, createdAt: new Date(now - 3_000).toISOString() }),
      asLinkDoc({ id: 2, rankingScore: 30, createdAt: new Date(now - 2_000).toISOString() }),
    ]
    const posts = [
      asPostDoc({ id: 5, rankingScore: 30, createdAt: new Date(now - 1_000).toISOString() }),
      asPostDoc({ id: 6, rankingScore: 5, createdAt: new Date(now).toISOString() }),
    ]

    expect(mergeAndSortSubfeedItems(links, posts).map((item) => `${item.type}-${item.id}`)).toEqual([
      'post-5',
      'link-2',
      'link-1',
      'post-6',
    ])

    expect(
      mergeAndSortSubfeedItems(links, posts, 2).map((item) => `${item.type}-${item.id}`),
    ).toEqual(['post-5', 'link-2'])
  })
})

describe('feed assembly where builders (pure)', () => {
  const viewer = {
    id: 5,
    roles: ['user'],
    settings: { nsfw: false },
  } as unknown as User

  it('builds the Home base where from the visibility policy', () => {
    expect(
      buildHomeFeedBaseWhere({
        viewer,
        bookmarkedLinkIds: [3, 4],
        includeSubfeeds: true,
        joinedSubfeedIds: [9],
      }),
    ).toEqual([
      ...buildPublicFeedVisibilityWhere({ collection: 'links', viewer }),
      { id: { in: [3, 4] } },
      {
        or: [
          buildMainFeedWhere(),
          {
            and: [
              { feed: { equals: 'subfeed' } },
              { subfeed: { in: [9] } },
            ],
          },
        ],
      },
    ])

    // Empty bookmark sets must match nothing rather than the whole feed.
    expect(buildHomeFeedBaseWhere({ viewer, bookmarkedLinkIds: [] })).toContainEqual({
      id: { in: [0] },
    })

    // Without a viewer the Main Feed filter stands alone, even when a joined
    // list is supplied.
    expect(
      buildHomeFeedBaseWhere({ viewer: null, includeSubfeeds: true, joinedSubfeedIds: [9] }),
    ).toEqual([
      ...buildPublicFeedVisibilityWhere({ collection: 'links', viewer: null }),
      buildMainFeedWhere(),
    ])
  })

  it('narrows the Home where by signal', () => {
    const baseAndFilters = buildHomeFeedBaseWhere({ viewer })

    expect(
      buildHomeFeedWhere({
        baseAndFilters,
        signal: 'trending',
        viewer,
        joinedSubfeedIds: [],
        dayAgoIso: 'day-ago',
      }),
    ).toEqual({ and: [...baseAndFilters, buildTrendingSignalWhere()] })

    expect(
      buildHomeFeedWhere({
        baseAndFilters,
        signal: 'discussions',
        viewer,
        joinedSubfeedIds: [],
        dayAgoIso: 'day-ago',
      }),
    ).toEqual({
      and: [
        ...baseAndFilters,
        { commentsCount: { greater_than: 0 } },
        { createdAt: { greater_than_equal: 'day-ago' } },
      ],
    })

    expect(
      buildHomeFeedWhere({
        baseAndFilters,
        signal: 'subfeeds',
        viewer,
        joinedSubfeedIds: [9],
        dayAgoIso: 'day-ago',
      }),
    ).toEqual({
      and: [
        ...baseAndFilters,
        { feed: { equals: 'subfeed' } },
        { subfeed: { in: [9] } },
      ],
    })

    // Guests have no joined subfeeds, so the signal must match nothing.
    const guestSignalWhere = buildHomeFeedWhere({
      baseAndFilters,
      signal: 'subfeeds',
      viewer: null,
      joinedSubfeedIds: [],
      dayAgoIso: 'day-ago',
    })
    expect((guestSignalWhere as { and: unknown[] }).and.at(-1)).toEqual({
      id: { in: [0] },
    })

    expect(
      buildHomeFeedWhere({
        baseAndFilters,
        signal: null,
        viewer,
        joinedSubfeedIds: [],
        dayAgoIso: 'day-ago',
      }),
    ).toEqual({ and: baseAndFilters })
  })

  it('builds SubFeed content wheres with viewer NSFW and quarantine policy', () => {
    const guest = buildSubfeedContentWhere({ collection: 'links', subfeedId: 7 })
    expect(guest.and).toEqual(
      expect.arrayContaining([
        ...buildPublicFeedVisibilityWhere({ collection: 'links', viewer: null }),
        { feed: { equals: 'subfeed' } },
        { subfeed: { equals: 7 } },
      ]),
    )

    const optedIn = buildSubfeedContentWhere({
      collection: 'posts',
      subfeedId: 7,
      viewer: { id: 1, settings: { nsfw: true, language: 'en' } } as unknown as User,
      createdAtGte: 'gte',
      createdAtLt: 'lt',
    })
    expect(optedIn.and).toEqual(
      expect.arrayContaining([
        { status: { equals: 'published' } },
        { status: { not_equals: 'removed' } },
        { quarantined: { not_equals: true } },
        { feed: { equals: 'subfeed' } },
        { subfeed: { equals: 7 } },
        { createdAt: { greater_than_equal: 'gte' } },
        { createdAt: { less_than: 'lt' } },
      ]),
    )
    expect(optedIn.and).not.toContainEqual({ nsfw: { not_equals: true } })
  })
})

describe('SubFeed feed assembly (integration)', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('excludes NSFW, soft-deleted, removed, and quarantined items from items and pulse', async () => {
    const owner = await createTestUser(payload)
    const subfeed = await createSubfeed(owner.id)
    const safeTag = `safe-${unique()}`
    const nsfwTag = `nsfw-${unique()}`
    const removedTag = `removed-${unique()}`
    const quarantinedTag = `quarantined-${unique()}`

    const safeLink = await createLink({
      user: owner.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      tag: safeTag,
    })
    const safePost = await createPost({
      user: owner.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      tag: safeTag,
    })
    const nsfwLink = await createLink({
      user: owner.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      nsfw: true,
      tag: nsfwTag,
    })
    const nsfwPost = await createPost({
      user: owner.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      nsfw: true,
      tag: nsfwTag,
    })
    const removedLink = await createLink({
      user: owner.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      softDeleted: true,
      tag: removedTag,
    })
    const removedPost = await createPost({
      user: owner.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      status: 'removed',
      tag: removedTag,
    })
    const quarantinedLink = await createLink({
      user: owner.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      quarantined: true,
      tag: quarantinedTag,
    })
    const quarantinedPost = await createPost({
      user: owner.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      quarantined: true,
      tag: quarantinedTag,
    })

    const guestFeed = await loadSubfeedFeed({
      payload,
      user: null,
      subfeed,
      selectedWindow: '24h',
      selectedContentFilter: 'all',
      canQuickEditLinks: false,
      lang: 'en',
    })

    const guestLinkIds = guestFeed.links.map((link) => link.id)
    const guestPostIds = guestFeed.posts.map((post) => post.id)
    expect(guestLinkIds).toEqual([safeLink.id])
    expect(guestPostIds).toEqual([safePost.id])
    expect(guestLinkIds).not.toContain(nsfwLink.id)
    expect(guestLinkIds).not.toContain(removedLink.id)
    expect(guestLinkIds).not.toContain(quarantinedLink.id)
    expect(guestPostIds).not.toContain(nsfwPost.id)
    expect(guestPostIds).not.toContain(removedPost.id)
    expect(guestPostIds).not.toContain(quarantinedPost.id)

    // Pulse counts use the same policy, so the dirty items never inflate them.
    expect(guestFeed.newLinks).toBe(1)
    expect(guestFeed.newPosts).toBe(1)
    expect(guestFeed.activity).toBe(2)
    expect(guestFeed.trendPoints.reduce((total, value) => total + value, 0)).toBe(2)
    expect(guestFeed.trendingTopics).toContain(safeTag)
    expect(guestFeed.trendingTopics).not.toContain(nsfwTag)
    expect(guestFeed.trendingTopics).not.toContain(removedTag)
    expect(guestFeed.trendingTopics).not.toContain(quarantinedTag)

    // A signed-in viewer who has not opted into NSFW sees the same safe set.
    const plainViewer = await createTestUser(payload)
    const memberFeed = await loadSubfeedFeed({
      payload,
      user: plainViewer,
      subfeed,
      selectedWindow: '24h',
      selectedContentFilter: 'all',
      canQuickEditLinks: false,
      lang: 'en',
    })
    expect(memberFeed.links.map((link) => link.id)).toEqual([safeLink.id])
    expect(memberFeed.activity).toBe(2)

    // Opting into NSFW includes the NSFW items, still excluding removed/quarantined.
    const nsfwViewer = await payload.update({
      collection: 'users',
      id: plainViewer.id,
      data: { settings: { nsfw: true, language: 'en' } },
      overrideAccess: true,
    })
    const optedInFeed = await loadSubfeedFeed({
      payload,
      user: nsfwViewer,
      subfeed,
      selectedWindow: '24h',
      selectedContentFilter: 'all',
      canQuickEditLinks: false,
      lang: 'en',
    })
    expect(optedInFeed.links.map((link) => link.id).sort()).toEqual(
      [safeLink.id, nsfwLink.id].sort(),
    )
    expect(optedInFeed.posts.map((post) => post.id).sort()).toEqual(
      [safePost.id, nsfwPost.id].sort(),
    )
    expect(optedInFeed.activity).toBe(4)
    expect(optedInFeed.links.map((link) => link.id)).not.toContain(removedLink.id)
    expect(optedInFeed.posts.map((post) => post.id)).not.toContain(quarantinedPost.id)

    // Filtering by content type works against the assembled mixed list.
    const linksOnly = await loadSubfeedFeed({
      payload,
      user: null,
      subfeed,
      selectedWindow: '24h',
      selectedContentFilter: 'links',
      canQuickEditLinks: false,
      lang: 'en',
    })
    expect(linksOnly.filteredItems.every((item) => item.type === 'link')).toBe(true)
    expect(linksOnly.filteredItems.map((item) => item.id)).toEqual([safeLink.id])
  })

  it('applies the same policy when querying the where directly', async () => {
    const owner = await createTestUser(payload)
    const subfeed = await createSubfeed(owner.id)

    const safe = await createLink({
      user: owner.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
    })
    const nsfw = await createLink({
      user: owner.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      nsfw: true,
    })
    const quarantined = await createLink({
      user: owner.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      quarantined: true,
    })

    const publicIds = (
      await payload.find({
        collection: 'links',
        where: buildSubfeedContentWhere({ collection: 'links', subfeedId: subfeed.id }),
        depth: 0,
        limit: 100,
        overrideAccess: true,
      })
    ).docs.map((doc) => doc.id)
    expect(publicIds).toEqual([safe.id])
    expect(publicIds).not.toContain(nsfw.id)
    expect(publicIds).not.toContain(quarantined.id)

    const optedInIds = (
      await payload.find({
        collection: 'links',
        where: buildSubfeedContentWhere({
          collection: 'links',
          subfeedId: subfeed.id,
          viewer: { settings: { nsfw: true, language: 'en' } } as unknown as User,
        }),
        depth: 0,
        limit: 100,
        overrideAccess: true,
      })
    ).docs.map((doc) => doc.id)
    expect(optedInIds.sort()).toEqual([safe.id, nsfw.id].sort())
  })
})

describe('Home feed assembly (integration)', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('selects the Main Feed, narrows the trending signal, and mixes joined SubFeeds', async () => {
    const author = await createTestUser(payload)
    const subfeed = await createSubfeed(author.id)

    const mainLink = await createLink({ user: author.id, feed: 'main', upvotes: 30 })
    const plainUserLink = await createLink({ user: author.id, feed: 'user' })
    const featuredUserLink = await createLink({
      user: author.id,
      feed: 'user',
      featured: true,
    })
    const subfeedLink = await createLink({
      user: author.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
    })

    const baseArgs = {
      payload,
      user: author,
      mode: 'best' as const,
      signal: null,
      feedPage: 1000,
      showBookmarksOnly: false,
      persistedHomeSubfeedsView: 'trending' as const,
      canQuickEditLinks: false,
    }

    const mainOnly = await loadHomeFeed({ ...baseArgs, includeSubfeeds: false })
    const mainOnlyIds = new Set(mainOnly.links.map((link) => link.id))
    expect(mainOnlyIds.has(mainLink.id)).toBe(true)
    expect(mainOnlyIds.has(plainUserLink.id)).toBe(false)
    expect(mainOnlyIds.has(subfeedLink.id)).toBe(false)

    const mixed = await loadHomeFeed({ ...baseArgs, includeSubfeeds: true })
    const mixedIds = new Set(mixed.links.map((link) => link.id))
    expect(mixedIds.has(mainLink.id)).toBe(true)
    expect(mixedIds.has(subfeedLink.id)).toBe(true)
    expect(mixedIds.has(plainUserLink.id)).toBe(false)

    const trending = await loadHomeFeed({ ...baseArgs, includeSubfeeds: false, signal: 'trending' })
    const trendingIds = new Set(trending.links.map((link) => link.id))
    expect(trendingIds.has(featuredUserLink.id)).toBe(true)
    expect(trendingIds.has(plainUserLink.id)).toBe(false)

    // Sidebar + contributor context is assembled with the feed.
    expect(mixed.joinedSubfeedCount).toBeGreaterThan(0)
    expect(mixed.selectedSubfeedStripView).toBe('trending')
    expect(mixed.contributeVariant).toBe('member')
    expect(typeof mixed.trendingNowCount).toBe('number')
    expect(typeof mixed.freshDiscussionsCount).toBe('number')
  })

  it('hydrates card relations in targeted lookups', async () => {
    const author = await createTestUser(payload)
    const subfeed = await createSubfeed(author.id)

    const [hydrated] = await hydrateFeedCardRelations({
      payload,
      docs: [{ id: 1, subfeed: subfeed.id, user: author.id }],
    })

    expect(typeof hydrated.subfeed).toBe('object')
    expect((hydrated.subfeed as unknown as Subfeed).id).toBe(subfeed.id)
    expect(typeof hydrated.user).toBe('object')
    expect((hydrated.user as unknown as User).username).toBe(author.username)
  })
})
