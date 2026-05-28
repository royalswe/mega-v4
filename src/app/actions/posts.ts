'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedUser } from '@/lib/auth'
import { canModerateCommunity, isSubfeedMemberOrModerator } from '@/lib/community/subfeeds'

export async function vote(postId: number, type: 'up' | 'down') {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to vote')
  }

  const userId = user.id
  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  // Find existing vote
  const { docs: existingVotes } = await payload.find({
    collection: 'votes',
    where: {
      user: { equals: userId },
      post: { equals: postId },
    },
    ...withAccess,
  })

  // Perform the vote operation
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
  } else {
    await payload.create({
      collection: 'votes',
      data: { user: userId, post: postId, vote: type },
      ...withAccess,
    })
  }

  revalidatePath('/wall')
  revalidatePath(`/post/${postId}`)
}

export async function toggleBookmark(postId: number) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to bookmark')
  }

  const userId = user.id
  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  const { docs: existingBookmarks } = await payload.find({
    collection: 'bookmarks',
    where: {
      user: {
        equals: userId,
      },
      post: {
        equals: postId,
      },
    },
    ...withAccess,
  })

  if (existingBookmarks.length > 0) {
    // Bookmark exists, so delete it
    await payload.delete({
      collection: 'bookmarks',
      id: existingBookmarks[0].id,
      ...withAccess,
    })
  } else {
    // Bookmark does not exist, so create it
    await payload.create({
      collection: 'bookmarks',
      data: {
        user: userId,
        post: postId,
      },
      ...withAccess,
    })
  }

  revalidatePath('/wall')
  revalidatePath(`/post/${postId}`)
}

export async function submitPost(values: {
  title: string
  content: string
  nsfw?: boolean
  feed: 'user' | 'subfeed'
  subfeedId?: number
}) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to submit a post')
  }

  const userId = user.id
  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  let subfeedId: number | undefined
  let subfeedSlug: string | null = null

  if (values.feed === 'subfeed') {
    if (
      typeof values.subfeedId !== 'number' ||
      !Number.isInteger(values.subfeedId) ||
      values.subfeedId <= 0
    ) {
      throw new Error('Please select a subfeed destination')
    }

    const subfeed = await payload.findByID({
      collection: 'subfeeds',
      id: values.subfeedId,
      depth: 0,
      ...withAccess,
    })

    if (!canModerateCommunity(user) && !isSubfeedMemberOrModerator(subfeed, userId)) {
      throw new Error('You must join this subfeed before posting')
    }

    subfeedId = subfeed.id
    subfeedSlug = subfeed.slug
  }

  await payload.create({
    collection: 'posts',
    data: {
      title: values.title,
      content: JSON.parse(values.content),
      nsfw: values.nsfw,
      user: userId,
      feed: values.feed,
      subfeed: subfeedId,
      type: 'discussion',
    },
    ...withAccess,
  })

  revalidatePath('/wall')
  revalidatePath('/subfeeds')

  if (subfeedSlug) {
    revalidatePath(`/subfeeds/${subfeedSlug}`)
  }
}
