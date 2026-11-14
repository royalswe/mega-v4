import type { Payload, Where } from 'payload'

import { FEED_PAGE_SIZE, FEED_MAX_PAGES } from '@/app/(frontend)/data/feedPaging'
import {
  getPublishingDestinationEligibility,
  loadPublishingDestinationEligibility,
} from '@/lib/community/subfeeds'
import type { PublishingDestinationEligibility } from '@/lib/community/subfeeds'
import type { Link as LinkDoc, Post as PostDoc, Subfeed, User } from '@/payload-types'

import { buildMainFeedWhere, buildTrendingSignalWhere } from './promotion'
import { buildPublicFeedVisibilityWhere } from './visibility'

/**
 * Feed assembly for the Home, SubFeed, and Wall routes.
 *
 * This module owns the query orchestration that used to live inline in the
 * route components: URL parameter parsing, `where`-clause construction,
 * relation hydration, signal counts, and trend buckets. It is the deep module
 * behind those three pages — routes keep their JSX and URL builders, while
 * every visibility/ordering decision is made here so Home, SubFeeds, and the
 * Wall cannot drift apart.
 */

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export type FeedSignal = 'trending' | 'subfeeds' | 'discussions'
export type FeedMode = 'best' | 'new' | 'rising'
export type HomeSubfeedsView = 'trending' | 'joined'
export type PulseWindow = '24h' | '7d'
export type SubfeedContentFilter = 'all' | 'links' | 'posts'
export type TrendDirection = -1 | 0 | 1

export const MODE_SORT_BY: Record<FeedMode, string> = {
  best: '-rankingScore',
  new: '-createdAt',
  rising: '-engagementVelocity',
}

export const parseSignal = (value: string | undefined): FeedSignal | null => {
  if (value === 'trending' || value === 'subfeeds' || value === 'discussions') return value
  return null
}

export const parseMode = (value: string | undefined): FeedMode => {
  if (value === 'new' || value === 'rising') return value
  return 'best'
}

export const parseHomeSubfeedsView = (value: string | undefined): HomeSubfeedsView => {
  if (value === 'joined') return 'joined'
  return 'trending'
}

export const parsePulseWindow = (value: string | string[] | undefined): PulseWindow => {
  const normalized = Array.isArray(value) ? value[0] : value
  if (normalized === '7d') return '7d'
  return '24h'
}

export const parseContentFilter = (
  value: string | string[] | undefined,
): SubfeedContentFilter => {
  const normalized = Array.isArray(value) ? value[0] : value
  if (normalized === 'links' || normalized === 'posts') return normalized
  return 'all'
}

export const toTrendDirection = (current: number, previous: number): TrendDirection => {
  if (current > previous) return 1
  if (current < previous) return -1
  return 0
}

/* -------------------------------------------------------------------------- */
/* Pure trend, roster, and mixed-content helpers                              */
/* -------------------------------------------------------------------------- */

export const extractTrendingTopics = (
  items: Array<Pick<LinkDoc, 'tags'> | Pick<PostDoc, 'tags'>>,
): string[] => {
  const seen = new Map<string, { label: string; count: number }>()

  for (const item of items) {
    for (const rawTag of item.tags ?? []) {
      const trimmed = rawTag.trim()
      if (!trimmed) continue

      const normalized = trimmed.toLowerCase()
      const existing = seen.get(normalized)

      if (existing) {
        existing.count += 1
      } else {
        seen.set(normalized, { label: trimmed, count: 1 })
      }
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.label.localeCompare(b.label)
    })
    .slice(0, 5)
    .map((topic) => topic.label)
}

const toRosterUserId = (value: unknown): number | null => {
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    const parsed = typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : NaN
    return Number.isFinite(parsed) ? parsed : null
  }

  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export const mapRoster = (values: unknown): Array<{ id: number; username: string }> => {
  if (!Array.isArray(values)) return []

  const result: Array<{ id: number; username: string }> = []
  for (const value of values) {
    const id = toRosterUserId(value)
    if (id === null) continue

    const username =
      value && typeof value === 'object' && 'username' in value
        ? ((value as { username?: unknown }).username as string | null | undefined)
        : null

    result.push({ id, username: username || `User #${id}` })
  }

  return result
}

const toIntlLocale = (lang: 'en' | 'sv') => {
  return lang === 'sv' ? 'sv-SE' : 'en-US'
}

export const buildTrendBucketLabels = (
  now: number,
  window: PulseWindow,
  lang: 'en' | 'sv',
): string[] => {
  const bucketCount = window === '24h' ? 8 : 7
  const windowMs = window === '24h' ? DAY_MS : 7 * DAY_MS
  const bucketMs = windowMs / bucketCount
  const windowStart = now - windowMs
  const locale = toIntlLocale(lang)

  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  })
  const dayFormatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
  })

  return Array.from({ length: bucketCount }, (_, index) => {
    const start = new Date(windowStart + bucketMs * index)
    const end = new Date(windowStart + bucketMs * (index + 1))

    if (window === '24h') {
      return `${timeFormatter.format(start)}-${timeFormatter.format(end)}`
    }

    return dayFormatter.format(start)
  })
}

export const buildTrendPoints = (
  createdAtValues: string[],
  now: number,
  window: PulseWindow,
): number[] => {
  const bucketCount = window === '24h' ? 8 : 7
  const windowMs = window === '24h' ? DAY_MS : 7 * DAY_MS
  const bucketMs = windowMs / bucketCount

  const points = Array.from({ length: bucketCount }, () => 0)
  const windowStart = now - windowMs

  for (const timestamp of createdAtValues) {
    const createdAtMs = Date.parse(timestamp)
    if (Number.isNaN(createdAtMs)) continue
    if (createdAtMs < windowStart || createdAtMs > now) continue

    const elapsed = createdAtMs - windowStart
    const index = Math.min(bucketCount - 1, Math.floor(elapsed / bucketMs))
    points[index] += 1
  }

  return points
}

export type MergedSubfeedItem =
  | { type: 'link'; id: number; rankingScore: number; createdAt: number; link: LinkDoc }
  | { type: 'post'; id: number; rankingScore: number; createdAt: number; post: PostDoc }

export const mergeAndSortSubfeedItems = (
  links: LinkDoc[],
  posts: PostDoc[],
  limit = 50,
): MergedSubfeedItem[] => {
  return [
    ...links.map((link) => ({
      type: 'link' as const,
      id: link.id,
      rankingScore: link.rankingScore ?? 0,
      createdAt: Date.parse(link.createdAt),
      link,
    })),
    ...posts.map((post) => ({
      type: 'post' as const,
      id: post.id,
      rankingScore: post.rankingScore ?? 0,
      createdAt: Date.parse(post.createdAt),
      post,
    })),
  ]
    .sort((a, b) => {
      if (b.rankingScore !== a.rankingScore) {
        return b.rankingScore - a.rankingScore
      }

      return (
        (Number.isNaN(b.createdAt) ? 0 : b.createdAt) -
        (Number.isNaN(a.createdAt) ? 0 : a.createdAt)
      )
    })
    .slice(0, limit)
}

/* -------------------------------------------------------------------------- */
/* Pure where-clause builders                                                  */
/* -------------------------------------------------------------------------- */

export interface HomeFeedBaseWhereOptions {
  viewer?: User | null
  bookmarkedLinkIds?: number[] | null
  includeSubfeeds?: boolean
  joinedSubfeedIds?: number[]
}

export const buildHomeFeedBaseWhere = (options: HomeFeedBaseWhereOptions): Where[] => {
  const joinedSubfeedIds = options.joinedSubfeedIds ?? []
  const filters = [
    ...buildPublicFeedVisibilityWhere({ collection: 'links', viewer: options.viewer }),
  ]

  if (Array.isArray(options.bookmarkedLinkIds)) {
    // An empty bookmark set must match nothing rather than the entire feed.
    filters.push({
      id: { in: options.bookmarkedLinkIds.length > 0 ? options.bookmarkedLinkIds : [0] },
    })
  }

  if (options.viewer && options.includeSubfeeds && joinedSubfeedIds.length > 0) {
    filters.push({
      or: [
        buildMainFeedWhere(),
        {
          and: [{ feed: { equals: 'subfeed' } }, { subfeed: { in: joinedSubfeedIds } }],
        },
      ],
    })
  } else {
    filters.push(buildMainFeedWhere())
  }

  return filters
}

export interface HomeFeedWhereOptions {
  baseAndFilters: Where[]
  signal: FeedSignal | null
  viewer?: User | null
  joinedSubfeedIds?: number[]
  dayAgoIso: string
}

export const buildHomeFeedWhere = (options: HomeFeedWhereOptions): Where => {
  const filters = [...options.baseAndFilters]
  const joinedSubfeedIds = options.joinedSubfeedIds ?? []

  if (options.signal === 'trending') {
    filters.push(buildTrendingSignalWhere())
  }

  if (options.signal === 'discussions') {
    filters.push({ commentsCount: { greater_than: 0 } })
    filters.push({ createdAt: { greater_than_equal: options.dayAgoIso } })
  }

  if (options.signal === 'subfeeds') {
    if (options.viewer && joinedSubfeedIds.length > 0) {
      filters.push({ feed: { equals: 'subfeed' } })
      filters.push({ subfeed: { in: joinedSubfeedIds } })
    } else {
      filters.push({ id: { in: [0] } })
    }
  }

  return { and: filters }
}

export interface SubfeedContentWhereOptions {
  collection: 'links' | 'posts'
  subfeedId: number
  viewer?: User | null
  createdAtGte?: string
  createdAtLt?: string
}

/**
 * Public SubFeed content filter. Unlike the old inline route filters this
 * applies the shared visibility policy, so a viewer's NSFW preference and
 * quarantine exclusions hold for items, counts, and trend queries alike.
 */
export const buildSubfeedContentWhere = (options: SubfeedContentWhereOptions): Where => {
  const filters: Where[] = [
    ...buildPublicFeedVisibilityWhere({
      collection: options.collection,
      viewer: options.viewer,
    }),
    { feed: { equals: 'subfeed' } },
    { subfeed: { equals: options.subfeedId } },
  ]

  if (options.createdAtGte) {
    filters.push({ createdAt: { greater_than_equal: options.createdAtGte } })
  }

  if (options.createdAtLt) {
    filters.push({ createdAt: { less_than: options.createdAtLt } })
  }

  return { and: filters }
}

/* -------------------------------------------------------------------------- */
/* Card relation hydration                                                     */
/* -------------------------------------------------------------------------- */

type FeedCardDoc = {
  subfeed?: number | Subfeed | null
  user?: number | User | null
}

export interface HydrateFeedCardRelationsArgs<T extends FeedCardDoc> {
  payload: Payload
  docs: T[]
  subfeedDepth?: number
  subfeedSelect?: Record<string, true>
}

const toUniqueIds = (values: Array<number | null>): number[] =>
  Array.from(new Set(values.filter((value): value is number => value !== null)))

/**
 * Hydrates the card-level relations the feeds render — the SubFeed chip and the
 * author username — with two targeted queries instead of deep population.
 * `LinkCard`/`PostCard` only read `name`, `slug`, and `avatar` from the
 * SubFeed and `username` from the author.
 */
export const hydrateFeedCardRelations = async <T extends FeedCardDoc>({
  payload,
  docs,
  subfeedDepth = 1,
  subfeedSelect = { name: true, slug: true, avatar: true },
}: HydrateFeedCardRelationsArgs<T>): Promise<T[]> => {
  const subfeedIds = toUniqueIds(
    docs.map((doc) => (typeof doc.subfeed === 'number' ? doc.subfeed : null)),
  )
  const userIds = toUniqueIds(
    docs.map((doc) => (typeof doc.user === 'number' ? doc.user : null)),
  )

  const [subfeedDocs, userDocs] = await Promise.all([
    subfeedIds.length > 0
      ? payload.find({
          collection: 'subfeeds',
          where: { id: { in: subfeedIds } },
          depth: subfeedDepth,
          limit: subfeedIds.length,
          select: subfeedSelect as never,
          overrideAccess: false,
        })
      : Promise.resolve({ docs: [] as Subfeed[] }),
    userIds.length > 0
      ? payload.find({
          collection: 'users',
          where: { id: { in: userIds } },
          depth: 0,
          limit: userIds.length,
          select: { username: true },
          overrideAccess: false,
        })
      : Promise.resolve({ docs: [] as User[] }),
  ])

  const subfeedById = new Map<number, Subfeed>(
    subfeedDocs.docs.map((subfeed) => [subfeed.id, subfeed as Subfeed]),
  )
  const userById = new Map<number, User>(userDocs.docs.map((author) => [author.id, author as User]))

  return docs.map((doc) => ({
    ...doc,
    subfeed:
      typeof doc.subfeed === 'number'
        ? (subfeedById.get(doc.subfeed) ?? doc.subfeed)
        : doc.subfeed,
    user: typeof doc.user === 'number' ? (userById.get(doc.user) ?? doc.user) : doc.user,
  }))
}

/* -------------------------------------------------------------------------- */
/* Deep assembly                                                               */
/* -------------------------------------------------------------------------- */

const buildAccessScope = (user: User | null) =>
  user
    ? { user, overrideAccess: false as const }
    : { overrideAccess: false as const }

const buildWindowWhere = (
  filters: Where[],
  window: { gte: string; lt?: string },
): Where => ({
  and: [
    ...filters,
    { createdAt: { greater_than_equal: window.gte } },
    ...(window.lt ? [{ createdAt: { less_than: window.lt } }] : []),
  ],
})

export interface HomeSubfeedStripItem {
  subfeed: Subfeed
  activityToday: number
}

export interface HomeFeedData {
  links: LinkDoc[]
  quickEditSubfeeds: Array<{ id: number; name: string }>
  publishingEligibility: PublishingDestinationEligibility
  trendingSubfeeds: HomeSubfeedStripItem[]
  joinedSubfeedsSidebar: HomeSubfeedStripItem[]
  selectedSubfeedStripView: HomeSubfeedsView
  activeSubfeedStrip: HomeSubfeedStripItem[]
  trendingNowCount: number
  newInYourSubfeedsCount: number | null
  freshDiscussionsCount: number
  trendingNowTrend: TrendDirection
  newInYourSubfeedsTrend: TrendDirection | null
  freshDiscussionsTrend: TrendDirection
  contributeVariant: 'member' | 'noSubfeeds' | 'guest'
  joinedSubfeedCount: number
  hasMoreLinks: boolean
}

export interface LoadHomeFeedArgs {
  payload: Payload
  user: User | null
  mode: FeedMode
  signal: FeedSignal | null
  feedPage: number
  showBookmarksOnly: boolean
  includeSubfeeds: boolean
  persistedHomeSubfeedsView: HomeSubfeedsView
  canQuickEditLinks: boolean
  now?: number
}

const countBySubfeed = (
  docs: Array<{ subfeed?: number | Subfeed | null }>,
): Map<number, number> => {
  const counts = new Map<number, number>()
  for (const doc of docs) {
    if (typeof doc.subfeed === 'number') {
      counts.set(doc.subfeed, (counts.get(doc.subfeed) ?? 0) + 1)
    }
  }
  return counts
}

export const loadHomeFeed = async ({
  payload,
  user,
  mode,
  signal,
  feedPage,
  showBookmarksOnly,
  includeSubfeeds,
  persistedHomeSubfeedsView,
  canQuickEditLinks,
  now = Date.now(),
}: LoadHomeFeedArgs): Promise<HomeFeedData> => {
  const dayAgoIso = new Date(now - DAY_MS).toISOString()
  const twoDaysAgoIso = new Date(now - 2 * DAY_MS).toISOString()
  const withAccess = buildAccessScope(user)

  let bookmarkedLinkIds: number[] | undefined
  if (showBookmarksOnly && user) {
    const { docs: userBookmarks } = await payload.find({
      collection: 'bookmarks',
      where: { user: { equals: user.id } },
      limit: 1000,
      depth: 0,
      select: { link: true },
      user,
      overrideAccess: false,
    })

    bookmarkedLinkIds = userBookmarks
      .map((bookmark) => (typeof bookmark.link === 'number' ? bookmark.link : bookmark.link?.id))
      .filter((id): id is number => typeof id === 'number')
  }

  let joinedSubfeedIds: number[] = []
  let publishingEligibility = getPublishingDestinationEligibility(user, [])

  if (user) {
    // Membership lookup targeted at the current user. Selecting only `name`
    // keeps member rosters out of the result.
    const { docs: joinedDocs } = await payload.find({
      collection: 'subfeeds',
      where: { members: { in: [user.id] } },
      depth: 0,
      limit: 500,
      select: { name: true },
      user,
      overrideAccess: false,
    })

    joinedSubfeedIds = joinedDocs.map((subfeed) => subfeed.id)
    publishingEligibility = await loadPublishingDestinationEligibility(payload, user)
  }

  let quickEditSubfeeds: Array<{ id: number; name: string }> = []
  if (user && canQuickEditLinks) {
    const { docs: subfeedsForEdit } = await payload.find({
      collection: 'subfeeds',
      sort: 'name',
      depth: 0,
      limit: 200,
      select: { name: true },
      user,
      overrideAccess: false,
    })

    quickEditSubfeeds = subfeedsForEdit.map((subfeed) => ({
      id: subfeed.id,
      name: subfeed.name,
    }))
  }

  const baseAndFilters = buildHomeFeedBaseWhere({
    viewer: user,
    bookmarkedLinkIds,
    includeSubfeeds,
    joinedSubfeedIds,
  })

  const feed = await payload.find({
    collection: 'links',
    where: buildHomeFeedWhere({
      baseAndFilters,
      signal,
      viewer: user,
      joinedSubfeedIds,
      dayAgoIso,
    }),
    sort: MODE_SORT_BY[mode],
    limit: feedPage * FEED_PAGE_SIZE,
    // Card-level relations are hydrated with two targeted queries below;
    // default depth would populate every subfeed roster and comment thread.
    depth: 0,
    select: {
      id: true,
      votes: true,
      url: true,
      title: true,
      type: true,
      description: true,
      feed: true,
      subfeed: true,
      user: true,
      clickCount: true,
      nsfw: true,
      editorialPriority: true,
      editorialPriorityUntil: true,
      commentsCount: true,
      createdAt: true,
      updatedAt: true,
    },
    ...withAccess,
  })

  // Sidebar subfeeds: discover (top reputation) + joined. `select` keeps member
  // rosters out of the result; `depth: 1` only populates the avatar media.
  const subfeedSelect = {
    name: true,
    slug: true,
    avatar: true,
    reputation: true,
    featured: true,
  } as const

  const [discoverSubfeeds, joinedSubfeeds] = await Promise.all([
    payload.find({
      collection: 'subfeeds',
      sort: '-reputation',
      limit: 12,
      depth: 1,
      select: subfeedSelect,
      ...withAccess,
    }),
    user && joinedSubfeedIds.length > 0
      ? payload.find({
          collection: 'subfeeds',
          where: { id: { in: joinedSubfeedIds } },
          sort: '-reputation',
          limit: 30,
          depth: 1,
          select: subfeedSelect,
          ...withAccess,
        })
      : Promise.resolve({ docs: [] as Subfeed[] }),
  ])

  // "Activity today" per subfeed: one links query + one posts query covering
  // both sidebar groups, bucketed in memory.
  const activitySubfeedIds = Array.from(
    new Set([...discoverSubfeeds.docs.map((subfeed) => subfeed.id), ...joinedSubfeedIds]),
  )

  const [activityLinks, activityPosts] =
    activitySubfeedIds.length > 0
      ? await Promise.all([
          payload.find({
            collection: 'links',
            where: {
              and: [
                { feed: { equals: 'subfeed' } },
                { subfeed: { in: activitySubfeedIds } },
                ...buildPublicFeedVisibilityWhere({ collection: 'links', viewer: user }),
                { createdAt: { greater_than_equal: dayAgoIso } },
              ],
            },
            limit: 1000,
            depth: 0,
            select: { subfeed: true },
            ...withAccess,
          }),
          payload.find({
            collection: 'posts',
            where: {
              and: [
                { feed: { equals: 'subfeed' } },
                { subfeed: { in: activitySubfeedIds } },
                ...buildPublicFeedVisibilityWhere({ collection: 'posts', viewer: user }),
                { createdAt: { greater_than_equal: dayAgoIso } },
              ],
            },
            limit: 1000,
            depth: 0,
            select: { subfeed: true },
            ...withAccess,
          }),
        ])
      : [
          { docs: [] as Array<Pick<LinkDoc, 'subfeed'>> },
          { docs: [] as Array<Pick<PostDoc, 'subfeed'>> },
        ]

  const linksTodayBySubfeed = countBySubfeed(activityLinks.docs)
  const postsTodayBySubfeed = countBySubfeed(activityPosts.docs)

  const activityToday = (subfeedId: number) =>
    (linksTodayBySubfeed.get(subfeedId) ?? 0) + (postsTodayBySubfeed.get(subfeedId) ?? 0)

  const trendingSubfeeds = discoverSubfeeds.docs
    .map((subfeed) => ({ subfeed: subfeed as Subfeed, activityToday: activityToday(subfeed.id) }))
    .sort((a, b) => {
      if (a.subfeed.featured !== b.subfeed.featured) {
        return a.subfeed.featured ? -1 : 1
      }

      if (a.activityToday !== b.activityToday) {
        return b.activityToday - a.activityToday
      }

      return (b.subfeed.reputation ?? 0) - (a.subfeed.reputation ?? 0)
    })

  const joinedSubfeedsSidebar = joinedSubfeeds.docs
    .map((subfeed) => ({ subfeed: subfeed as Subfeed, activityToday: activityToday(subfeed.id) }))
    .sort((a, b) => b.activityToday - a.activityToday)

  const selectedSubfeedStripView: HomeSubfeedsView =
    persistedHomeSubfeedsView === 'joined' && joinedSubfeedsSidebar.length > 0
      ? 'joined'
      : 'trending'

  const activeSubfeedStrip =
    selectedSubfeedStripView === 'joined' ? joinedSubfeedsSidebar : trendingSubfeeds

  const trendingSignalWhere = buildTrendingSignalWhere()
  const discussionSignalWhere: Where[] = [
    { commentsCount: { greater_than: 0 } },
  ]

  const [trendingCurrent, trendingPrevious, discussionsCurrent, discussionsPrevious] =
    await Promise.all([
      payload.find({
        collection: 'links',
        where: buildWindowWhere([...baseAndFilters, trendingSignalWhere], { gte: dayAgoIso }),
        limit: 0,
        depth: 0,
        user: user || undefined,
        overrideAccess: false,
      }),
      payload.find({
        collection: 'links',
        where: buildWindowWhere([...baseAndFilters, trendingSignalWhere], {
          gte: twoDaysAgoIso,
          lt: dayAgoIso,
        }),
        limit: 0,
        depth: 0,
        user: user || undefined,
        overrideAccess: false,
      }),
      payload.find({
        collection: 'links',
        where: buildWindowWhere([...baseAndFilters, ...discussionSignalWhere], { gte: dayAgoIso }),
        limit: 0,
        depth: 0,
        user: user || undefined,
        overrideAccess: false,
      }),
      payload.find({
        collection: 'links',
        where: buildWindowWhere([...baseAndFilters, ...discussionSignalWhere], {
          gte: twoDaysAgoIso,
          lt: dayAgoIso,
        }),
        limit: 0,
        depth: 0,
        user: user || undefined,
        overrideAccess: false,
      }),
    ])

  let newInYourSubfeedsCount: number | null = null
  let newInYourSubfeedsTrend: TrendDirection | null = null

  if (user && joinedSubfeedIds.length > 0) {
    const subfeedSignalFilters: Where[] = [
      ...buildPublicFeedVisibilityWhere({ collection: 'links', viewer: user }),
      { feed: { equals: 'subfeed' } },
      { subfeed: { in: joinedSubfeedIds } },
    ]

    const [signalResult, previousSignalResult] = await Promise.all([
      payload.find({
        collection: 'links',
        where: buildWindowWhere(subfeedSignalFilters, { gte: dayAgoIso }),
        limit: 0,
        depth: 0,
        user,
        overrideAccess: false,
      }),
      payload.find({
        collection: 'links',
        where: buildWindowWhere(subfeedSignalFilters, {
          gte: twoDaysAgoIso,
          lt: dayAgoIso,
        }),
        limit: 0,
        depth: 0,
        user,
        overrideAccess: false,
      }),
    ])

    newInYourSubfeedsCount = signalResult.totalDocs
    newInYourSubfeedsTrend = toTrendDirection(
      signalResult.totalDocs,
      previousSignalResult.totalDocs,
    )
  }

  const links = await hydrateFeedCardRelations({ payload, docs: feed.docs })

  const contributeVariant: 'member' | 'noSubfeeds' | 'guest' = !user
    ? 'guest'
    : joinedSubfeeds.docs.length > 0
      ? 'member'
      : 'noSubfeeds'

  return {
    links: links as LinkDoc[],
    quickEditSubfeeds,
    publishingEligibility,
    trendingSubfeeds,
    joinedSubfeedsSidebar,
    selectedSubfeedStripView,
    activeSubfeedStrip,
    trendingNowCount: trendingCurrent.totalDocs,
    newInYourSubfeedsCount,
    freshDiscussionsCount: discussionsCurrent.totalDocs,
    trendingNowTrend: toTrendDirection(trendingCurrent.totalDocs, trendingPrevious.totalDocs),
    newInYourSubfeedsTrend,
    freshDiscussionsTrend: toTrendDirection(
      discussionsCurrent.totalDocs,
      discussionsPrevious.totalDocs,
    ),
    contributeVariant,
    joinedSubfeedCount: joinedSubfeedIds.length,
    hasMoreLinks: feed.totalDocs > feed.docs.length && feedPage < FEED_MAX_PAGES,
  }
}

export interface SubfeedFeedData {
  links: LinkDoc[]
  posts: PostDoc[]
  mixedItems: MergedSubfeedItem[]
  filteredItems: MergedSubfeedItem[]
  newLinks: number
  newPosts: number
  activity: number
  activityDelta: number
  trendPoints: number[]
  trendBucketLabels: string[]
  trendingTopics: string[]
  quickEditSubfeeds: Array<{ id: number; name: string }>
}

export interface LoadSubfeedFeedArgs {
  payload: Payload
  user: User | null
  subfeed: Subfeed
  selectedWindow: PulseWindow
  selectedContentFilter: SubfeedContentFilter
  canQuickEditLinks: boolean
  lang: 'en' | 'sv'
  now?: number
}

/**
 * Loads a SubFeed's top content, pulse counts, and trend series. Every query
 * (items, counts, and the recent-300 trend source) goes through
 * `buildSubfeedContentWhere`, so viewer NSFW preferences and quarantine
 * exclusions apply consistently across all of them.
 */
export const loadSubfeedFeed = async ({
  payload,
  user,
  subfeed,
  selectedWindow,
  selectedContentFilter,
  canQuickEditLinks,
  lang,
  now = Date.now(),
}: LoadSubfeedFeedArgs): Promise<SubfeedFeedData> => {
  const windowMs = (selectedWindow === '24h' ? 24 : 7 * 24) * HOUR_MS
  const currentWindowStart = new Date(now - windowMs).toISOString()
  const previousWindowStart = new Date(now - windowMs * 2).toISOString()
  const withAccess = buildAccessScope(user)

  const linkWhere = (window?: { gte: string; lt?: string }) =>
    buildSubfeedContentWhere({
      collection: 'links',
      subfeedId: subfeed.id,
      viewer: user,
      createdAtGte: window?.gte,
      createdAtLt: window?.lt,
    })

  const postWhere = (window?: { gte: string; lt?: string }) =>
    buildSubfeedContentWhere({
      collection: 'posts',
      subfeedId: subfeed.id,
      viewer: user,
      createdAtGte: window?.gte,
      createdAtLt: window?.lt,
    })

  const currentWindow = { gte: currentWindowStart }
  const previousWindow = { gte: previousWindowStart, lt: currentWindowStart }

  const [
    { docs: links },
    { docs: posts },
    currentLinks,
    currentPosts,
    previousLinks,
    previousPosts,
    recentLinks,
    recentPosts,
  ] = await Promise.all([
    payload.find({
      collection: 'links',
      where: linkWhere(),
      sort: '-rankingScore',
      limit: 25,
      ...withAccess,
    }),
    payload.find({
      collection: 'posts',
      where: postWhere(),
      sort: '-rankingScore',
      limit: 25,
      ...withAccess,
    }),
    payload.find({
      collection: 'links',
      where: linkWhere(currentWindow),
      limit: 0,
      depth: 0,
      ...withAccess,
    }),
    payload.find({
      collection: 'posts',
      where: postWhere(currentWindow),
      limit: 0,
      depth: 0,
      ...withAccess,
    }),
    payload.find({
      collection: 'links',
      where: linkWhere(previousWindow),
      limit: 0,
      depth: 0,
      ...withAccess,
    }),
    payload.find({
      collection: 'posts',
      where: postWhere(previousWindow),
      limit: 0,
      depth: 0,
      ...withAccess,
    }),
    payload.find({
      collection: 'links',
      where: linkWhere(currentWindow),
      limit: 300,
      depth: 0,
      sort: '-createdAt',
      ...withAccess,
    }),
    payload.find({
      collection: 'posts',
      where: postWhere(currentWindow),
      limit: 300,
      depth: 0,
      sort: '-createdAt',
      ...withAccess,
    }),
  ])

  const newLinks = currentLinks.totalDocs
  const newPosts = currentPosts.totalDocs
  const activity = newLinks + newPosts
  const previousActivity = previousLinks.totalDocs + previousPosts.totalDocs
  const activityDelta = activity - previousActivity

  const recentDocs = [...recentLinks.docs, ...recentPosts.docs]
  const trendPoints = buildTrendPoints(
    recentDocs.map((item) => item.createdAt),
    now,
    selectedWindow,
  )
  const trendBucketLabels = buildTrendBucketLabels(now, selectedWindow, lang)
  const trendingTopics = extractTrendingTopics(recentDocs)

  let quickEditSubfeeds: Array<{ id: number; name: string }> = []
  if (user && canQuickEditLinks) {
    const { docs: subfeedsForEdit } = await payload.find({
      collection: 'subfeeds',
      sort: 'name',
      depth: 0,
      limit: 200,
      user,
      overrideAccess: false,
    })

    quickEditSubfeeds = subfeedsForEdit.map((subfeedForEdit) => ({
      id: subfeedForEdit.id,
      name: subfeedForEdit.name,
    }))
  }

  const mixedItems = mergeAndSortSubfeedItems(links, posts, 50)
  const filteredItems = mixedItems.filter((item) => {
    if (selectedContentFilter === 'all') return true
    if (selectedContentFilter === 'links') return item.type === 'link'
    return item.type === 'post'
  })

  return {
    links,
    posts,
    mixedItems,
    filteredItems,
    newLinks,
    newPosts,
    activity,
    activityDelta,
    trendPoints,
    trendBucketLabels,
    trendingTopics,
    quickEditSubfeeds,
  }
}
