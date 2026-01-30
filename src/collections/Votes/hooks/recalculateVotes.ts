// src/collections/Votes/hooks/recalculateVotes.ts
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

export const recalculateVotes: CollectionAfterChangeHook & CollectionAfterDeleteHook = async ({
  doc,
  req: { payload },
}) => {
  // Ensure we have a valid Link ID (handling both object and string/number)
  const linkId = typeof doc.link === 'object' ? doc.link.id : doc.link

  if (!linkId) return

  // Fetch all votes for this specific link
  const { docs: allVotes } = await payload.find({
    collection: 'votes',
    where: {
      link: { equals: linkId },
    },
    limit: 1000, // Adjust based on expected volume
    depth: 0,
  })

  // Calculate the total score
  const totalScore = allVotes.reduce((acc, curr) => {
    return curr.vote === 'up' ? acc + 1 : acc - 1
  }, 0)

  // Update the Link document with the new count
  try {
    await payload.update({
      collection: 'links',
      id: linkId,
      data: {
        votes: totalScore,
      },
    })
  } catch (err) {
    payload.logger.error(`Failed to update vote count for link ${linkId}: ${err}`)
  }
}
