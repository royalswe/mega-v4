import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { cache } from 'react'

export const getUserInteractions = cache(async (userId: string | number, linkIds: number[]) => {
  if (!userId || linkIds.length === 0) {
    return { votes: {}, bookmarks: {} }
  }

  const payload = await getPayload({ config: configPromise })

  const [votes, bookmarks] = await Promise.all([
    payload.find({
      collection: 'votes',
      where: {
        user: { equals: userId },
        link: { in: linkIds },
      },
      limit: 1000, 
    }),
    payload.find({
      collection: 'bookmarks',
      where: {
        user: { equals: userId },
        link: { in: linkIds },
      },
      limit: 1000,
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
})
