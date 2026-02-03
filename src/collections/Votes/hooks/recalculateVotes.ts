import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

/**
 * Hook to recalculate the total votes for a link whenever a vote is created, updated, or deleted.
 * This ensures the `votes` field on the `links` collection is always up-to-date.
 */
export const recalculateVotes: CollectionAfterChangeHook & CollectionAfterDeleteHook = async ({
  doc, // The document that was changed or deleted
  req: { payload }, // Payload instance from the request
}) => {
  // Extract the link ID from the vote document
  const linkId = typeof doc.link === 'object' ? doc.link.id : doc.link

  // If no link ID is found, exit early
  if (!linkId) return

  try {
    // Step 1: Fetch all votes associated with the link
    const { docs: allVotes } = await payload.find({
      collection: 'votes',
      where: {
        link: { equals: linkId },
      },
      pagination: false, // Fetch all votes without pagination
      depth: 0, // Fetch only the necessary fields
    })

    // Step 2: Calculate the total score based on the votes
    const totalScore = allVotes.reduce((acc, curr) => {
      return curr.vote === 'up' ? acc + 1 : acc - 1
    }, 0)

    // Step 3: Update the `votes` field on the associated link
    await payload.update({
      collection: 'links',
      id: linkId,
      data: {
        votes: totalScore,
      },
      overrideAccess: true, // Bypass access control to ensure the update succeeds
    })
  } catch (error: any) {
    // Log any errors that occur during the process
    payload.logger.error(`Failed to recalculate votes for link ${linkId}: ${error.message}`)
  }
}
