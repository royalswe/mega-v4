import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, expect } from 'vitest'
import { faker } from '@faker-js/faker'

let payload: Payload

describe('User Settings Integration', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('can persist nsfw preference', async () => {
    // 1. Create User
    const user = await payload.create({
      collection: 'users',
      data: {
        email: faker.internet.email(),
        username: faker.internet.username(),
        password: faker.internet.password(),
        settings: {
          language: 'en',
          nsfw: false,
        },
      },
    })

    expect(user.settings?.nsfw).toBe(false)

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
