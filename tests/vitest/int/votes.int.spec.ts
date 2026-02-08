import { Payload } from 'payload'
import { getTestPayload, getTestUser } from '../utils/test-user'
import { describe, it, beforeAll, expect } from 'vitest'
import { createTestLink } from './helpers'

let payload: Payload

describe('Votes Integration', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('updates link vote count on upvote, downvote and remove', async () => {
    // 1. Create User & Link
    const user = await getTestUser()
    const link = await createTestLink(payload, user.id)

    expect(link.votes).toBe(0)

    // 3. Upvote
    const upvote = await payload.create({
      collection: 'votes',
      data: {
        user: user.id,
        link: link.id,
        vote: 'up',
      },
    })

    const linkAfterUpvote = await payload.findByID({
      collection: 'links',
      id: link.id,
    })
    expect(linkAfterUpvote.votes).toBe(1)

    // 4. Change to Downvote
    await payload.update({
      collection: 'votes',
      id: upvote.id,
      data: {
        vote: 'down',
      },
    })

    const linkAfterDownvote = await payload.findByID({
      collection: 'links',
      id: link.id,
    })
    expect(linkAfterDownvote.votes).toBe(-1)

    // 5. Delete Vote
    await payload.delete({
      collection: 'votes',
      id: upvote.id,
    })

    const linkAfterDelete = await payload.findByID({
      collection: 'links',
      id: link.id,
    })
    expect(linkAfterDelete.votes).toBe(0)
  })
})
