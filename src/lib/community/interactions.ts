import type { Payload, Where } from 'payload'

import type { User } from '@/payload-types'

type TargetCollection = 'links' | 'posts'

const targetFieldFor = (targetCollection: TargetCollection): 'link' | 'post' =>
  targetCollection === 'links' ? 'link' : 'post'

/**
 * Casts (or retracts) a vote on a link or post. Shared by the two server-action
 * modules so both collections toggle votes identically.
 *
 * The `user` + `overrideAccess: false` pair is preserved on every operation so
 * collection access control and hooks still apply.
 */
export const castContentVote = async ({
  payload,
  user,
  targetCollection,
  targetId,
  type,
}: {
  payload: Payload
  user: User | null | undefined
  targetCollection: TargetCollection
  targetId: number
  type: 'up' | 'down'
}): Promise<void> => {
  if (!user) {
    throw new Error('You must be logged in to vote')
  }

  const userId = user.id
  const withAccess = {
    user,
    overrideAccess: false as const,
  }
  const targetField = targetFieldFor(targetCollection)
  const targetWhere = (
    targetField === 'link' ? { link: { equals: targetId } } : { post: { equals: targetId } }
  ) as Where

  const { docs: existingVotes } = await payload.find({
    collection: 'votes',
    where: {
      user: { equals: userId },
      ...targetWhere,
    },
    ...withAccess,
  })

  if (existingVotes.length > 0) {
    if (existingVotes[0].vote === type) {
      await payload.delete({ collection: 'votes', id: existingVotes[0].id, ...withAccess })
    } else {
      await payload.update({
        collection: 'votes',
        id: existingVotes[0].id,
        data: { vote: type },
        ...withAccess,
      })
    }

    return
  }

  await payload.create({
    collection: 'votes',
    data:
      targetField === 'link'
        ? { user: userId, link: targetId, vote: type }
        : { user: userId, post: targetId, vote: type },
    ...withAccess,
  })
}

/**
 * Toggles a bookmark on a link or post and reports the resulting state.
 * Shared by the two server-action modules.
 */
export const toggleContentBookmark = async ({
  payload,
  user,
  targetCollection,
  targetId,
}: {
  payload: Payload
  user: User | null | undefined
  targetCollection: TargetCollection
  targetId: number
}): Promise<{ bookmarked: boolean }> => {
  if (!user) {
    throw new Error('You must be logged in to bookmark')
  }

  const userId = user.id
  const withAccess = {
    user,
    overrideAccess: false as const,
  }
  const targetField = targetFieldFor(targetCollection)
  const targetWhere = (
    targetField === 'link' ? { link: { equals: targetId } } : { post: { equals: targetId } }
  ) as Where

  const { docs: existingBookmarks } = await payload.find({
    collection: 'bookmarks',
    where: {
      user: { equals: userId },
      ...targetWhere,
    },
    ...withAccess,
  })

  if (existingBookmarks.length > 0) {
    await payload.delete({
      collection: 'bookmarks',
      id: existingBookmarks[0].id,
      ...withAccess,
    })

    return { bookmarked: false }
  }

  await payload.create({
    collection: 'bookmarks',
    data:
      targetField === 'link'
        ? { user: userId, link: targetId }
        : { user: userId, post: targetId },
    ...withAccess,
  })

  return { bookmarked: true }
}
