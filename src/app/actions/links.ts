'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedUser } from '@/lib/auth'

export async function vote(linkId: number, type: 'up' | 'down') {
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
      link: { equals: linkId },
    },
  })

  // Just perform the operation.
  // The HOOK in your collection will automatically update the Link's vote count.
  // BUT: We also manually update here to ensure atomic consistency before revalidation
  // to avoid UI flicker (where the hook hasn't finished yet).
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
      data: { user: userId, link: linkId, vote: type },
    })
  }

  // ATOMIC UPDATE: Recalculate immediately
  // Fetch all votes for this specific link (using the same payload instance which is request-scoped but should be fine here)
  // Actually, let's use the same robust logic as the hook: find ALL votes.
  const { docs: allVotes } = await payload.find({
    collection: 'votes',
    where: {
      link: { equals: linkId },
    },
    limit: 5000,
    depth: 0,
    overrideAccess: true,
  })

  // Calculate the total score
  const totalScore = allVotes.reduce((acc, curr) => {
    return curr.vote === 'up' ? acc + 1 : curr.vote === 'down' ? acc - 1 : acc
  }, 0)

  // Update the Link document with the new count
  await payload.update({
    collection: 'links',
    id: linkId,
    data: {
      votes: totalScore,
    },
    overrideAccess: true,
  })

  revalidatePath('/')
}

export async function toggleBookmark(linkId: number) {
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
      link: {
        equals: linkId,
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
        link: linkId,
      },
    })
  }

  revalidatePath('/')
  revalidatePath('/submitted')
  revalidatePath(`/link/${linkId}`)
}

export async function submitLink(values: {
  title: string
  url: string
  description?: string
  nsfw?: boolean
  type?: 'article' | 'video' | 'image' | 'audio' | 'game'
}) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to submit a link')
  }

  const userId = user.id

  await payload.create({
    collection: 'links',
    data: {
      ...values,
      user: userId,
      status: 'pending',
    },
    draft: true,
  })

  revalidatePath('/')
  revalidatePath('/submitted')
}
