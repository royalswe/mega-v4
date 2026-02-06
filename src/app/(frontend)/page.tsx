export const dynamic = 'force-dynamic' // This stops the build-time DB check

import type { Where } from 'payload'

import { LinkCard } from '@/components/links/LinkCard'
import { getUserInteractions } from '@/app/(frontend)/data/getInteractions'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { BookmarksFilter } from '@/components/links/BookmarksFilter'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ bookmarks?: string }>
}) {
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  const showNSFW = user?.settings?.nsfw === true
  const showBookmarksOnly = (await searchParams)?.bookmarks === 'true'

  const where: Where = {
    _status: {
      equals: 'published',
    },
  }

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
      },
      limit: 1000,
      depth: 0,
    })

    if (userBookmarks.length > 0) {
      where.id = {
        in: userBookmarks.map((b) => (typeof b.link === 'number' ? b.link : b.link.id)),
      }
    } else {
      // If user has no bookmarks, match nothing
      where.id = {
        in: [0],
      }
    }
  }

  const { docs: links } = await payload.find({
    collection: 'links',
    where,
    sort: '-createdAt',
  })

  // Fetch user interactions (votes/bookmarks)
  const linkIds = links.map((link) => link.id)
  const { votes, bookmarks } = await getUserInteractions(user?.id || 0, linkIds)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{dict.pages.title}</h2>
        {user && <BookmarksFilter label={dict.pages.bookmarksOnly} />}
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
