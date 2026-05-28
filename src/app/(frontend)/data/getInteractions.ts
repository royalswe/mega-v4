import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { cache } from 'react'

import type { User } from '@/payload-types'

export const getUserInteractions = cache(
  async (user: User | null | undefined, linkIds: number[]) => {
    if (!user?.id || linkIds.length === 0) {
      return { votes: {}, bookmarks: {} }
    }

    const payload = await getPayload({ config: configPromise })

    const [votes, bookmarks] = await Promise.all([
      payload.find({
        collection: 'votes',
        where: {
          user: { equals: user.id },
          link: { in: linkIds },
        },
        limit: 1000,
        overrideAccess: false,
        user,
      }),
      payload.find({
        collection: 'bookmarks',
        where: {
          user: { equals: user.id },
          link: { in: linkIds },
        },
        limit: 1000,
        overrideAccess: false,
        user,
      }),
    ])

    const voteMap: Record<number, 'up' | 'down'> = {}
    votes.docs.forEach((vote) => {
      if (typeof vote.link === 'object' && vote.link !== null) {
        voteMap[vote.link.id] = vote.vote
      } else {
        voteMap[vote.link as number] = vote.vote
      }
    })

    const bookmarkMap: Record<number, boolean> = {}
    bookmarks.docs.forEach((bookmark) => {
      if (typeof bookmark.link === 'object' && bookmark.link !== null) {
        bookmarkMap[bookmark.link.id] = true
      } else {
        bookmarkMap[bookmark.link as number] = true
      }
    })

    return { votes: voteMap, bookmarks: bookmarkMap }
  },
)
