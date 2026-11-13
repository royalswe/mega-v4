export const dynamic = 'force-dynamic'

import type { Where } from 'payload'
import Link from 'next/link'

import { PostCard } from '@/components/posts/PostCard'
import { getPostInteractions } from '@/app/(frontend)/data/getPostInteractions'
import { getAuthenticatedUser } from '@/lib/auth'
import { Button } from '@/components/ui/button'

import { BookmarksFilter } from '@/components/links/BookmarksFilter'
import { LazyFeedLoader } from '@/components/links/LazyFeedLoader.client'
import { FEED_MAX_PAGES, FEED_PAGE_SIZE, parseFeedPage } from '@/app/(frontend)/data/feedPaging'
import type { Subfeed, User } from '@/payload-types'

export default async function WallPage({
  searchParams,
}: {
  searchParams: Promise<{ bookmarks?: string; page?: string }>
}) {
  const { user, payload } = await getAuthenticatedUser()

  // Use optional chaining for safe access
  const showNSFW = user?.settings?.nsfw === true
  const resolvedSearchParams = (await searchParams) ?? {}
  const showBookmarksOnly = resolvedSearchParams?.bookmarks === 'true'
  const feedPage = parseFeedPage(resolvedSearchParams?.page)

  const andFilters: Where[] = [
    {
      quarantined: {
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
        post: { exists: true },
      },
      limit: 1000,
      depth: 0,
      select: { post: true },
      user,
      overrideAccess: false,
    })

    if (userBookmarks.length > 0) {
      andFilters.push({
        id: {
          in: userBookmarks
            .map((b) => (typeof b.post === 'number' ? b.post : b.post?.id))
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

  const where: Where = andFilters.length > 0 ? { and: andFilters } : {}

  const feed = await payload.find({
    collection: 'posts',
    where,
    sort: '-rankingScore',
    limit: feedPage * FEED_PAGE_SIZE,
    // Card-level relations (subfeed chip, author username) are hydrated with
    // two targeted queries below instead of deep population.
    depth: 0,
    select: {
      id: true,
      votes: true,
      title: true,
      content: true,
      type: true,
      feed: true,
      subfeed: true,
      user: true,
      editorialPriority: true,
      editorialPriorityUntil: true,
      commentsCount: true,
      createdAt: true,
      updatedAt: true,
      nsfw: true,
    },
    user: user || undefined,
    overrideAccess: false,
  })
  const postDocs = feed.docs

  const subfeedIdsOnPosts = Array.from(
    new Set(postDocs.map((post) => (typeof post.subfeed === 'number' ? post.subfeed : null))),
  ).filter((id): id is number => id !== null)

  const userIdsOnPosts = Array.from(
    new Set(postDocs.map((post) => (typeof post.user === 'number' ? post.user : null))),
  ).filter((id): id is number => id !== null)

  const [postSubfeeds, postUsers] = await Promise.all([
    subfeedIdsOnPosts.length > 0
      ? payload.find({
          collection: 'subfeeds',
          where: {
            id: {
              in: subfeedIdsOnPosts,
            },
          },
          depth: 0,
          limit: subfeedIdsOnPosts.length,
          select: { name: true, slug: true },
          overrideAccess: false,
        })
      : Promise.resolve({ docs: [] as Subfeed[] }),
    userIdsOnPosts.length > 0
      ? payload.find({
          collection: 'users',
          where: {
            id: {
              in: userIdsOnPosts,
            },
          },
          depth: 0,
          limit: userIdsOnPosts.length,
          select: { username: true },
          overrideAccess: false,
        })
      : Promise.resolve({ docs: [] as User[] }),
  ])

  // PostCard only reads `name` and `slug` from the subfeed object, and
  // `username` from the author. Cast the selected docs to the full entity
  // types to satisfy the card props without fetching entire rosters.
  const subfeedById = new Map<number, Subfeed>(
    postSubfeeds.docs.map((subfeed) => [subfeed.id, subfeed as Subfeed]),
  )
  const userById = new Map<number, User>(
    postUsers.docs.map((author) => [author.id, author as User]),
  )

  const posts = postDocs.map((post) => ({
    ...post,
    subfeed:
      typeof post.subfeed === 'number'
        ? (subfeedById.get(post.subfeed) ?? post.subfeed)
        : post.subfeed,
    user: typeof post.user === 'number' ? (userById.get(post.user) ?? post.user) : post.user,
  }))

  // Fetch user interactions (votes/bookmarks)
  const postIds = posts.map((post) => post.id)
  const { votes, bookmarks } = await getPostInteractions(user, postIds)

  // Lazy feed paging (same contract as the Home feed).
  const hasMorePosts = feed.totalDocs > postDocs.length && feedPage < FEED_MAX_PAGES
  const nextPageQuery = new URLSearchParams()
  if (resolvedSearchParams?.bookmarks) nextPageQuery.set('bookmarks', resolvedSearchParams.bookmarks)
  nextPageQuery.set('page', String(feedPage + 1))
  const nextFeedHref = `/wall?${nextPageQuery.toString()}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Community Wall</h2>
        <div className="flex items-center gap-4">
          {user && <BookmarksFilter label="Show Bookmarks Only" />}
          {user && (
            <Button asChild>
              <Link href="/new-post">Create Post</Link>
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {posts.length > 0 ? (
          <>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                userId={user?.id}
                userVote={votes[post.id]}
                isBookmarked={bookmarks[post.id]}
                className={post.nsfw ? 'nsfw-text' : ''}
              />
            ))}
            {hasMorePosts ? (
              <LazyFeedLoader nextHref={nextFeedHref} pendingLabel="Loading more…" />
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            {showBookmarksOnly
              ? 'No bookmarked posts found.'
              : 'No posts yet. Be the first to share something!'}
          </p>
        )}
      </div>
    </div>
  )
}
