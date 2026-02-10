export const dynamic = 'force-dynamic'

import type { Where } from 'payload'
import Link from 'next/link'

import { PostCard } from '@/components/posts/PostCard'
import { getPostInteractions } from '@/app/(frontend)/data/getPostInteractions'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { Button } from '@/components/ui/button'

import { BookmarksFilter } from '@/components/links/BookmarksFilter'

export default async function WallPage({
  searchParams,
}: {
  searchParams: Promise<{ bookmarks?: string }>
}) {
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  // Use optional chaining for safe access
  const showNSFW = user?.settings?.nsfw === true
  const showBookmarksOnly = (await searchParams)?.bookmarks === 'true'

  const where: Where = {}

  if (!showNSFW) {
    where.nsfw = {
      not_equals: true,
    }
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
    })

    if (userBookmarks.length > 0) {
      where.id = {
        in: userBookmarks
          .map((b) => (typeof b.post === 'number' ? b.post : b.post?.id))
          .filter((id): id is number => typeof id === 'number'),
      }
    } else {
      // If user has no bookmarks, match nothing
      where.id = {
        in: [0],
      }
    }
  }

  const { docs: posts } = await payload.find({
    collection: 'posts',
    where,
    sort: '-createdAt',
  })

  // Fetch user interactions (votes/bookmarks)
  const postIds = posts.map((post) => post.id)
  const { votes, bookmarks } = await getPostInteractions(user?.id || 0, postIds)

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
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              userId={user?.id}
              userVote={votes[post.id]}
              isBookmarked={bookmarks[post.id]}
              className={post.nsfw ? 'nsfw-text' : ''}
            />
          ))
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
