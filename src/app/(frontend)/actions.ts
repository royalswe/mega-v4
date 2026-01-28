'use server'

import { getPayload } from 'payload'
import configPromise from '@payload-config'

import { revalidatePath } from 'next/cache'

export async function vote(linkId: string, type: 'up' | 'down') {
  const payload = await getPayload({
    config: configPromise,
  })

  // For now, we'll use the hardcoded dev user
  const { docs: users } = await payload.find({
    collection: 'users',
    where: {
      email: {
        equals: 'dev@example.com',
      },
    },
  })

  if (users.length === 0) {
    throw new Error('User not found')
  }

  const userId = users[0].id

  const { docs: existingVotes } = await payload.find({
    collection: 'votes',
    where: {
      user: {
        equals: userId,
      },
      link: {
        equals: linkId,
      },
    },
  })

  if (existingVotes.length > 0) {
    const existingVote = existingVotes[0]
    // User has already voted
    if (existingVote.vote === type) {
      // If the user is clicking the same button again, remove the vote
      await payload.delete({
        collection: 'votes',
        id: existingVote.id,
      })
    } else {
      // If the user is changing their vote, update the existing vote
      await payload.update({
        collection: 'votes',
        id: existingVote.id,
        data: {
          vote: type,
        },
      })
    }
  } else {
    // New vote
    await payload.create({
      collection: 'votes',
      data: {
        user: userId,
        link: linkId,
        vote: type,
      },
    })
  }

  // Recalculate votes
  const { docs: allVotes } = await payload.find({
    collection: 'votes',
    where: {
      link: {
        equals: linkId,
      },
    },
  })

  const voteCount = allVotes.reduce((acc, vote) => {
    if (vote.vote === 'up') {
      return acc + 1
    }
    return acc - 1
  }, 0)

  await payload.update({
    collection: 'links',
    id: linkId,
    data: {
      votes: voteCount,
    },
  })

  revalidatePath('/')
  revalidatePath('/submitted')
}
