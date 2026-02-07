import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, expect } from 'vitest'
import { faker } from '@faker-js/faker'

let payload: Payload

describe('Bookmarks Integration', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('can bookmark a link', async () => {
    // 1. Create User
    const user = await payload.create({
      collection: 'users',
      data: {
        email: faker.internet.email(),
        username: faker.internet.username(),
        password: faker.internet.password(),
        settings: {
          nsfw: false,
          language: 'en',
        },
      },
      draft: false,
    })

    // 2. Create Link
    const link = await payload.create({
      collection: 'links',
      data: {
        title: faker.lorem.words(4),
        url: faker.internet.url(),
        type: 'article',
        user: user.id,
        _status: 'published',
      },
    })

    // 3. Create Bookmark
    const bookmark = await payload.create({
      collection: 'bookmarks',
      data: {
        user: user.id,
        link: link.id,
      },
    })

    expect(bookmark).toBeDefined()
    expect(bookmark.user).toEqual(expect.objectContaining({ id: user.id }))
    expect(bookmark.link).toEqual(expect.objectContaining({ id: link.id }))
  })
})
