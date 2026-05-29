export const dynamic = 'force-dynamic' // This stops the build-time DB check

import { cookies } from 'next/headers'
import type { Where } from 'payload'

import { LinkCard } from '@/components/links/LinkCard'
import { getUserInteractions } from '@/app/(frontend)/data/getInteractions'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { BookmarksFilter } from '@/components/links/BookmarksFilter'
import { FeedMixFilter } from '@/components/links/FeedMixFilter'
import { readRelationshipIds } from '@/lib/community/subfeeds'

const SUBFEED_PROMOTION_THRESHOLD = {
  score: 4,
  upvotes: 5,
  rankingScore: 100,
  spamProbability: 0.45,
  ragebaitProbability: 0.7,
} as const

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ bookmarks?: string; mixSubfeeds?: string }>
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
                spamProbability: {
                  less_than: SUBFEED_PROMOTION_THRESHOLD.spamProbability,
                },
              },
              {
                ragebaitProbability: {
                  less_than: SUBFEED_PROMOTION_THRESHOLD.ragebaitProbability,
                },
              },
            ],
          },
        ],
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

  if (includeSubfeeds && user) {
    const { docs: subfeeds } = await payload.find({
      collection: 'subfeeds',
      sort: 'name',
      depth: 0,
      limit: 500,
      user,
      overrideAccess: false,
    })

    const joinedSubfeedIds = subfeeds
      .filter((subfeed) => readRelationshipIds(subfeed.members).includes(user.id))
      .map((subfeed) => subfeed.id)

    if (joinedSubfeedIds.length > 0) {
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

  const where: Where = {
    and: andFilters,
  }

  const { docs: links } = await payload.find({
    collection: 'links',
    where,
    sort: '-rankingScore',
    limit: 100,
    user: user || undefined,
    overrideAccess: false,
  })

  // Fetch user interactions (votes/bookmarks)
  const linkIds = links.map((link) => link.id)
  const { votes, bookmarks } = await getUserInteractions(user, linkIds)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{dict.pages.title}</h2>
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
