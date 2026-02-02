export const dynamic = 'force-dynamic' // This stops the build-time DB check

import React from 'react'
import { LinkCard } from '@/components/links/LinkCard'

import { getUserInteractions } from '@/app/(frontend)/data/getInteractions'
import { getAuthenticatedUser } from '@/lib/auth'

export default async function HomePage() {
  const { user, payload } = await getAuthenticatedUser()

  const showNSFW = user?.settings?.nsfw === true

  const where: any = {
    status: {
      equals: 'approved',
    },
  }

  if (!showNSFW) {
    where.nsfw = {
      not_equals: true,
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
      <h2 className="text-xl font-semibold mb-4">Approved Links</h2>
      <div className="grid gap-4">
        {links.map((link) => (
          <LinkCard
            key={link.id}
            link={link}
            userId={user?.id}
            userVote={votes[link.id]}
            isBookmarked={bookmarks[link.id]}
            className={link.nsfw ? 'nsfw-text' : ''}
          />
        ))}
      </div>
    </div>
  )
}
