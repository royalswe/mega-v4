export const dynamic = 'force-dynamic' // This stops the build-time DB check

import Link from 'next/link'
import { cookies } from 'next/headers'
import type { Where } from 'payload'

import { LinkCard } from '@/components/links/LinkCard'
import { getUserInteractions } from '@/app/(frontend)/data/getInteractions'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { BookmarksFilter } from '@/components/links/BookmarksFilter'
import { FeedMixFilter } from '@/components/links/FeedMixFilter'
import { MainFeedHighlights } from '@/components/links/MainFeedHighlights'
import { readRelationshipIds } from '@/lib/community/subfeeds'

const SUBFEED_PROMOTION_THRESHOLD = {
  score: 4,
  upvotes: 5,
  rankingScore: 100,
} as const

type FeedSignal = 'trending' | 'subfeeds' | 'discussions'
type FeedMode = 'best' | 'new' | 'rising'

const parseSignal = (value: string | undefined): FeedSignal | null => {
  if (value === 'trending' || value === 'subfeeds' || value === 'discussions') return value
  return null
}

const parseMode = (value: string | undefined): FeedMode => {
  if (value === 'new' || value === 'rising') return value
  return 'best'
}

const toQuery = (params: {
  bookmarks?: string
  mixSubfeeds?: string
  signal?: string
  mode?: string
}) => {
  const query = new URLSearchParams()
  if (params.bookmarks) query.set('bookmarks', params.bookmarks)
  if (params.mixSubfeeds) query.set('mixSubfeeds', params.mixSubfeeds)
  if (params.signal) query.set('signal', params.signal)
  if (params.mode && params.mode !== 'best') query.set('mode', params.mode)
  return query
}

const toTrendDirection = (current: number, previous: number): -1 | 0 | 1 => {
  if (current > previous) return 1
  if (current < previous) return -1
  return 0
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    bookmarks?: string
    mixSubfeeds?: string
    signal?: string
    mode?: string
  }>
}) {
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()
  const cookieStore = await cookies()
  const resolvedSearchParams = await searchParams

  const showNSFW = user?.settings?.nsfw === true
  const showBookmarksOnly = resolvedSearchParams?.bookmarks === 'true'
  const persistedMixSubfeeds = cookieStore.get('mixSubfeeds')?.value === 'true'
  const mixSubfeedsParam = resolvedSearchParams?.mixSubfeeds
  const includeSubfeeds = Boolean(
    user &&
    (mixSubfeedsParam === 'true'
      ? true
      : mixSubfeedsParam === 'false'
        ? false
        : persistedMixSubfeeds),
  )
  const signal = parseSignal(resolvedSearchParams.signal)
  const mode = parseMode(resolvedSearchParams.mode)
  const now = Date.now()
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const twoDaysAgo = new Date(now - 48 * 60 * 60 * 1000).toISOString()

  const buildSignalHref = (nextSignal: FeedSignal | null) => {
    const query = toQuery({
      bookmarks: resolvedSearchParams.bookmarks,
      mixSubfeeds: resolvedSearchParams.mixSubfeeds,
      signal: nextSignal ?? undefined,
      mode,
    })

    const queryString = query.toString()
    return queryString.length > 0 ? `/?${queryString}` : '/'
  }

  const buildModeHref = (nextMode: FeedMode) => {
    const query = toQuery({
      bookmarks: resolvedSearchParams.bookmarks,
      mixSubfeeds: resolvedSearchParams.mixSubfeeds,
      signal: resolvedSearchParams.signal,
      mode: nextMode,
    })

    const queryString = query.toString()
    return queryString.length > 0 ? `/?${queryString}` : '/'
  }

  const modeSortBy: Record<FeedMode, string> = {
    best: '-rankingScore',
    new: '-createdAt',
    rising: '-engagementVelocity',
  }

  const signalLabelByKey: Record<FeedSignal, string> = {
    trending: dict.pages.highlights.trendingNow,
    subfeeds: dict.pages.highlights.newInYourSubfeeds,
    discussions: dict.pages.highlights.freshDiscussions,
  }

  const modeDescriptionByKey: Record<FeedMode, string> = {
    best: dict.pages.modeDescriptions.best,
    new: dict.pages.modeDescriptions.newest,
    rising: dict.pages.modeDescriptions.rising,
  }

  const andFilters: Where[] = [
    {
      _status: {
        equals: 'published',
      },
    },
    {
      softDeleted: {
        not_equals: true,
      },
    },
  ]

  if (!showNSFW) {
    andFilters.push({
      nsfw: {
        not_equals: true,
      },
    })
  }

  // If filtering by bookmarks, we need to first get the user's bookmarks
  if (showBookmarksOnly && user) {
    const { docs: userBookmarks } = await payload.find({
      collection: 'bookmarks',
      where: {
        user: { equals: user.id },
      },
      limit: 1000,
      depth: 0,
      user,
      overrideAccess: false,
    })

    if (userBookmarks.length > 0) {
      andFilters.push({
        id: {
          in: userBookmarks
            .map((b) => (typeof b.link === 'number' ? b.link : b.link?.id))
            .filter((id): id is number => typeof id === 'number'),
        },
      })
    } else {
      // If user has no bookmarks, match nothing
      andFilters.push({
        id: {
          in: [0],
        },
      })
    }
  }

  const promotedSubfeedFilter: Where = {
    and: [
      {
        feed: {
          equals: 'subfeed',
        },
      },
      {
        or: [
          {
            featured: {
              equals: true,
            },
          },
          {
            and: [
              {
                score: {
                  greater_than_equal: SUBFEED_PROMOTION_THRESHOLD.score,
                },
              },
              {
                upvotes: {
                  greater_than_equal: SUBFEED_PROMOTION_THRESHOLD.upvotes,
                },
              },
              {
                rankingScore: {
                  greater_than_equal: SUBFEED_PROMOTION_THRESHOLD.rankingScore,
                },
              },
              {
                controversial: {
                  not_equals: true,
                },
              },
            ],
          },
        ],
      },
    ],
  }

  const trendingSignalFilter: Where = {
    or: [
      {
        featured: {
          equals: true,
        },
      },
      {
        score: {
          greater_than_equal: SUBFEED_PROMOTION_THRESHOLD.score,
        },
      },
      {
        upvotes: {
          greater_than_equal: SUBFEED_PROMOTION_THRESHOLD.upvotes,
        },
      },
      {
        rankingScore: {
          greater_than_equal: SUBFEED_PROMOTION_THRESHOLD.rankingScore,
        },
      },
    ],
  }

  const mainFeedFilter: Where = {
    or: [
      {
        feed: {
          equals: 'main',
        },
      },
      promotedSubfeedFilter,
    ],
  }

  let joinedSubfeedIds: number[] = []

  if (user) {
    const { docs: subfeeds } = await payload.find({
      collection: 'subfeeds',
      sort: 'name',
      depth: 0,
      limit: 500,
      user,
      overrideAccess: false,
    })

    joinedSubfeedIds = subfeeds
      .filter((subfeed) => readRelationshipIds(subfeed.members).includes(user.id))
      .map((subfeed) => subfeed.id)

    if (includeSubfeeds && joinedSubfeedIds.length > 0) {
      andFilters.push({
        or: [
          mainFeedFilter,
          {
            and: [
              {
                feed: {
                  equals: 'subfeed',
                },
              },
              {
                subfeed: {
                  in: joinedSubfeedIds,
                },
              },
            ],
          },
        ],
      })
    } else {
      andFilters.push(mainFeedFilter)
    }
  } else {
    andFilters.push(mainFeedFilter)
  }

  const baseAndFilters = [...andFilters]

  if (signal === 'trending') {
    andFilters.push(trendingSignalFilter)
  }

  if (signal === 'discussions') {
    andFilters.push({
      commentsCount: {
        greater_than: 0,
      },
    })
    andFilters.push({
      createdAt: {
        greater_than_equal: dayAgo,
      },
    })
  }

  if (signal === 'subfeeds') {
    if (user && joinedSubfeedIds.length > 0) {
      andFilters.push({
        feed: {
          equals: 'subfeed',
        },
      })
      andFilters.push({
        subfeed: {
          in: joinedSubfeedIds,
        },
      })
    } else {
      andFilters.push({
        id: {
          in: [0],
        },
      })
    }
  }

  const where: Where = {
    and: andFilters,
  }

  const { docs: links } = await payload.find({
    collection: 'links',
    where,
    sort: modeSortBy[mode],
    limit: 100,
    user: user || undefined,
    overrideAccess: false,
  })

  const trendingCurrentPromise = payload.find({
    collection: 'links',
    where: {
      and: [
        ...baseAndFilters,
        trendingSignalFilter,
        {
          createdAt: {
            greater_than_equal: dayAgo,
          },
        },
      ],
    },
    limit: 0,
    depth: 0,
    user: user || undefined,
    overrideAccess: false,
  })

  const trendingPreviousPromise = payload.find({
    collection: 'links',
    where: {
      and: [
        ...baseAndFilters,
        trendingSignalFilter,
        {
          createdAt: {
            greater_than_equal: twoDaysAgo,
          },
        },
        {
          createdAt: {
            less_than: dayAgo,
          },
        },
      ],
    },
    limit: 0,
    depth: 0,
    user: user || undefined,
    overrideAccess: false,
  })

  const discussionsCurrentPromise = payload.find({
    collection: 'links',
    where: {
      and: [
        ...baseAndFilters,
        {
          commentsCount: {
            greater_than: 0,
          },
        },
        {
          createdAt: {
            greater_than_equal: dayAgo,
          },
        },
      ],
    },
    limit: 0,
    depth: 0,
    user: user || undefined,
    overrideAccess: false,
  })

  const discussionsPreviousPromise = payload.find({
    collection: 'links',
    where: {
      and: [
        ...baseAndFilters,
        {
          commentsCount: {
            greater_than: 0,
          },
        },
        {
          createdAt: {
            greater_than_equal: twoDaysAgo,
          },
        },
        {
          createdAt: {
            less_than: dayAgo,
          },
        },
      ],
    },
    limit: 0,
    depth: 0,
    user: user || undefined,
    overrideAccess: false,
  })

  const [trendingCurrent, trendingPrevious, discussionsCurrent, discussionsPrevious] =
    await Promise.all([
      trendingCurrentPromise,
      trendingPreviousPromise,
      discussionsCurrentPromise,
      discussionsPreviousPromise,
    ])

  const trendingNowCount = trendingCurrent.totalDocs
  const freshDiscussionsCount = discussionsCurrent.totalDocs
  const trendingNowTrend = toTrendDirection(trendingCurrent.totalDocs, trendingPrevious.totalDocs)
  const freshDiscussionsTrend = toTrendDirection(
    discussionsCurrent.totalDocs,
    discussionsPrevious.totalDocs,
  )

  let newInYourSubfeedsCount: number | null = null
  let newInYourSubfeedsTrend: -1 | 0 | 1 | null = null

  if (user && joinedSubfeedIds.length > 0) {
    const subfeedSignalFilters: Where[] = [
      {
        feed: {
          equals: 'subfeed',
        },
      },
      {
        subfeed: {
          in: joinedSubfeedIds,
        },
      },
      {
        _status: {
          equals: 'published',
        },
      },
      {
        softDeleted: {
          not_equals: true,
        },
      },
      {
        createdAt: {
          greater_than_equal: dayAgo,
        },
      },
    ]

    if (!showNSFW) {
      subfeedSignalFilters.push({
        nsfw: {
          not_equals: true,
        },
      })
    }

    const signalResult = await payload.find({
      collection: 'links',
      where: {
        and: subfeedSignalFilters,
      },
      limit: 0,
      depth: 0,
      user,
      overrideAccess: false,
    })

    const previousSignalResult = await payload.find({
      collection: 'links',
      where: {
        and: [
          ...subfeedSignalFilters.filter(
            (filter) => !('createdAt' in filter && typeof filter.createdAt === 'object'),
          ),
          {
            createdAt: {
              greater_than_equal: twoDaysAgo,
            },
          },
          {
            createdAt: {
              less_than: dayAgo,
            },
          },
        ],
      },
      limit: 0,
      depth: 0,
      user,
      overrideAccess: false,
    })

    newInYourSubfeedsCount = signalResult.totalDocs
    newInYourSubfeedsTrend = toTrendDirection(
      signalResult.totalDocs,
      previousSignalResult.totalDocs,
    )
  }

  // Fetch user interactions (votes/bookmarks)
  const linkIds = links.map((link) => link.id)
  const { votes, bookmarks } = await getUserInteractions(user, linkIds)

  return (
    <div className="space-y-4">
      <MainFeedHighlights
        labels={dict.pages.highlights}
        trendingNowCount={trendingNowCount}
        newInYourSubfeedsCount={newInYourSubfeedsCount}
        freshDiscussionsCount={freshDiscussionsCount}
        trendingNowHref={buildSignalHref(signal === 'trending' ? null : 'trending')}
        newInYourSubfeedsHref={buildSignalHref(signal === 'subfeeds' ? null : 'subfeeds')}
        freshDiscussionsHref={buildSignalHref(signal === 'discussions' ? null : 'discussions')}
        trendingNowTrend={trendingNowTrend}
        newInYourSubfeedsTrend={newInYourSubfeedsTrend}
        freshDiscussionsTrend={freshDiscussionsTrend}
        activeSignal={signal}
      />

      <div className="flex items-center justify-between mb-4">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">{dict.pages.title}</h2>
          <div className="inline-flex items-center gap-1 rounded-md border bg-muted/40 p-1 text-xs">
            <span className="px-2 text-muted-foreground">{dict.pages.modeLabel}</span>
            <Link
              href={buildModeHref('best')}
              className={`rounded px-2 py-1 ${mode === 'best' ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {dict.pages.modes.best}
            </Link>
            <Link
              href={buildModeHref('new')}
              className={`rounded px-2 py-1 ${mode === 'new' ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {dict.pages.modes.newest}
            </Link>
            <Link
              href={buildModeHref('rising')}
              className={`rounded px-2 py-1 ${mode === 'rising' ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {dict.pages.modes.rising}
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">{modeDescriptionByKey[mode]}</p>
          {signal ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/70 bg-sky-50 px-3 py-1 text-xs text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100">
              <span>
                {dict.pages.highlights.activeFilterPrefix}: {signalLabelByKey[signal]}
              </span>
              <Link
                href={buildSignalHref(null)}
                className="font-medium underline decoration-sky-400/70 underline-offset-2 hover:text-sky-700 dark:hover:text-sky-200"
              >
                {dict.pages.highlights.clearFilter}
              </Link>
            </div>
          ) : null}
        </div>
        {user ? (
          <div className="flex items-center gap-3">
            <FeedMixFilter
              initialValue={includeSubfeeds}
              label={dict.pages.mixSubfeeds || 'Include links from my SubFeeds'}
              description={dict.pages.mainFeedOnly || 'Main feed only'}
            />
            <BookmarksFilter label={dict.pages.bookmarksOnly} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        {links.length > 0 ? (
          links.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              userId={user?.id}
              userVote={votes[link.id]}
              isBookmarked={bookmarks[link.id]}
              className={link.nsfw ? 'nsfw-text' : ''}
            />
          ))
        ) : (
          <p className="text-muted-foreground text-center py-8">
            {showBookmarksOnly ? dict.pages.noBookmarks : dict.pages.noLinks}{' '}
          </p>
        )}
      </div>
    </div>
  )
}
