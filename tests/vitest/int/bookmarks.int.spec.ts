import { Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'
import { faker } from '@faker-js/faker'
import { getTestPayload, getTestUser } from '../utils/test-user'

let payload: Payload

describe('Bookmarks Integration', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('can bookmark a link', async () => {
    // 1. Get Shared User
    const user = await getTestUser()

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
