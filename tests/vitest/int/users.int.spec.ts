import { Payload } from 'payload'
import { getTestPayload, getTestUser } from '../utils/test-user'
import { describe, it, beforeAll, expect } from 'vitest'

let payload: Payload

describe('User Settings Integration', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('can persist nsfw preference', async () => {
    // 1. Get Shared User
    const user = await getTestUser()

    // Ensure we start with nsfw: false
    // Only update if not already false to save DB calls, or just update to be safe and simple
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        settings: {
          nsfw: false,
        },
      },
    })

    // Re-fetch to confirm state (optional but good for test hygiene)
    const freshUser = await payload.findByID({ collection: 'users', id: user.id })
    expect(freshUser.settings?.nsfw).toBe(false)

    // 2. Update NSFW setting
    const updatedUser = await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        settings: {
          nsfw: true,
        },
      },
    })

    expect(updatedUser.settings?.nsfw).toBe(true)

    // 3. Verify persistence
    const fetchedUser = await payload.findByID({
      collection: 'users',
      id: user.id,
    })

    expect(fetchedUser.settings?.nsfw).toBe(true)
  })
})
