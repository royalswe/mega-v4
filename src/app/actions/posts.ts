'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedUser } from '@/lib/auth'

export async function vote(postId: number, type: 'up' | 'down') {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to vote')
  }

  const userId = user.id

  // Find existing vote
  const { docs: existingVotes } = await payload.find({
    collection: 'votes',
    where: {
      user: { equals: userId },
      post: { equals: postId },
    },
  })

  // Perform the vote operation
  if (existingVotes.length > 0) {
    if (existingVotes[0].vote === type) {
      await payload.delete({ collection: 'votes', id: existingVotes[0].id })
    } else {
      await payload.update({
        collection: 'votes',
        id: existingVotes[0].id,
        data: { vote: type },
      })
    }
  } else {
    await payload.create({
      collection: 'votes',
      data: { user: userId, post: postId, vote: type },
    })
  }

  // ATOMIC UPDATE: Recalculate immediately
  const { docs: allVotes } = await payload.find({
    collection: 'votes',
    where: {
      post: { equals: postId },
    },
    limit: 5000,
    depth: 0,
    overrideAccess: true,
  })

  // Calculate the total score
  const totalScore = allVotes.reduce((acc, curr) => {
    return curr.vote === 'up' ? acc + 1 : curr.vote === 'down' ? acc - 1 : acc
  }, 0)

  // Update the Post document with the new count
  await payload.update({
    collection: 'posts',
    id: postId,
    data: {
      votes: totalScore,
    },
    overrideAccess: true,
  })

  revalidatePath('/wall')
  revalidatePath(`/post/${postId}`)
}

export async function toggleBookmark(postId: number) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to bookmark')
  }

  const userId = user.id

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
  })

  if (existingBookmarks.length > 0) {
    // Bookmark exists, so delete it
    await payload.delete({
      collection: 'bookmarks',
      id: existingBookmarks[0].id,
    })
  } else {
    // Bookmark does not exist, so create it
    await payload.create({
      collection: 'bookmarks',
      data: {
        user: userId,
        post: postId,
      },
    })
  }

  revalidatePath('/wall')
  revalidatePath(`/post/${postId}`)
}

export async function submitPost(values: { title: string; content: string; nsfw?: boolean }) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to submit a post')
  }

  const userId = user.id

  await payload.create({
    collection: 'posts',
    data: {
      ...values,
      content: JSON.parse(values.content),
      user: userId,
    },
  })

  revalidatePath('/wall')
}
