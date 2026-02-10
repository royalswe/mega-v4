import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

/**
 * Hook to recalculate the total votes for a link whenever a vote is created, updated, or deleted.
 * This ensures the `votes` field on the `links` collection is always up-to-date.
 */
export const recalculateVotes: CollectionAfterChangeHook & CollectionAfterDeleteHook = async ({
  doc, // The document that was changed or deleted
  req, // Payload request including transaction
}) => {
  const { payload } = req
  // Extract the link ID and post ID from the vote document
  const linkId = typeof doc.link === 'object' ? doc.link?.id : doc.link
  const postId = typeof doc.post === 'object' ? doc.post?.id : doc.post

  // Determine which collection to update
  const targetId = linkId || postId
  const targetCollection = linkId ? 'links' : 'posts'

  // If no target ID is found, exit early
  if (!targetId || !targetCollection) return

  try {
    // Step 1: Fetch all votes associated with the link or post
    const { docs: allVotes } = await payload.find({
      collection: 'votes',
      where: {
        [targetCollection === 'links' ? 'link' : 'post']: { equals: targetId },
      },
      pagination: false, // Fetch all votes without pagination
      depth: 0, // Fetch only the necessary fields
      req, // Pass req to use the same transaction
    })

    // Step 2: Calculate the total score based on the votes
    const totalScore = allVotes.reduce((acc, curr) => {
      return curr.vote === 'up' ? acc + 1 : acc - 1
    }, 0)

    // Step 3: Update the `votes` field on the associated link or post
    await payload.update({
      collection: targetCollection,
      id: targetId,
      data: {
        votes: totalScore,
      },
      overrideAccess: true, // Bypass access control to ensure the update succeeds
      req, // Pass req to use the same transaction
    })
  } catch (error: any) {
    // Log any errors that occur during the process
    payload.logger.error(
      `Failed to recalculate votes for ${targetCollection} ${targetId}: ${error.message}`,
    )
  }
}
