import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { cache } from 'react'

import type { User } from '@/payload-types'

export const getPostInteractions = cache(
  async (user: User | null | undefined, postIds: number[]) => {
    if (!user?.id || postIds.length === 0) {
      return { votes: {}, bookmarks: {} }
    }

    const payload = await getPayload({ config: configPromise })

    const [votes, bookmarks] = await Promise.all([
      payload.find({
        collection: 'votes',
        where: {
          user: { equals: user.id },
          post: { in: postIds },
        },
        limit: 1000,
        overrideAccess: false,
        user,
      }),
      payload.find({
        collection: 'bookmarks',
        where: {
          user: { equals: user.id },
          post: { in: postIds },
        },
        limit: 1000,
        overrideAccess: false,
        user,
      }),
    ])

    const voteMap: Record<number, 'up' | 'down'> = {}
    votes.docs.forEach((vote) => {
      if (typeof vote.post === 'object' && vote.post !== null) {
        voteMap[vote.post.id] = vote.vote
      } else if (vote.post) {
        voteMap[vote.post as number] = vote.vote
      }
    })

    const bookmarkMap: Record<number, boolean> = {}
    bookmarks.docs.forEach((bookmark) => {
      if (typeof bookmark.post === 'object' && bookmark.post !== null) {
        bookmarkMap[bookmark.post.id] = true
      } else if (bookmark.post) {
        bookmarkMap[bookmark.post as number] = true
      }
    })

    return { votes: voteMap, bookmarks: bookmarkMap }
  },
)
