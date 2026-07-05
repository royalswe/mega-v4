import { Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'
import { faker } from '@faker-js/faker'

import { getTestPayload, getTestUser } from '../utils/test-user'
import { createTestUser } from './helpers'

let payload: Payload

const getRelationId = (value: unknown): number | string | undefined => {
  if (typeof value === 'number' || typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object' && 'id' in value) {
    const relation = value as { id?: number | string }
    return relation.id
  }

  return undefined
}

const createRichText = (text: string) => ({
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal' as const,
            style: '',
            text,
            type: 'text' as const,
            version: 1,
          },
        ],
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0,
        type: 'paragraph' as const,
        version: 1,
      },
    ],
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    type: 'root' as const,
    version: 1,
  },
})

const createTestSubfeed = async (userId: number) => {
  const unique = faker.string.alphanumeric(8).toLowerCase()

  return payload.create({
    collection: 'subfeeds',
    data: {
      name: `Test SubFeed ${unique}`,
      slug: `test-subfeed-${unique}`,
      description: `Integration test subfeed ${unique}`,
      moderators: [userId],
      members: [userId],
    },
    draft: false,
  })
}

describe('SubFeed Targeting Integration', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('creates a link in subfeed feed with subfeed relation', async () => {
    const user = await getTestUser()
    const subfeed = await createTestSubfeed(user.id)

    const link = await payload.create({
      collection: 'links',
      data: {
        title: `Subfeed Link ${faker.string.alphanumeric(10).toLowerCase()}`,
        url: `https://example.com/${faker.string.alphanumeric(10).toLowerCase()}`,
        type: 'article',
        user: user.id,
        feed: 'subfeed',
        subfeed: subfeed.id,
        _status: 'published',
      },
      draft: false,
    })

    expect(link.feed).toBe('subfeed')
    expect(getRelationId(link.subfeed)).toBe(subfeed.id)
  })

  it('creates a post in subfeed feed with subfeed relation', async () => {
    const user = await getTestUser()
    const subfeed = await createTestSubfeed(user.id)

    const post = await payload.create({
      collection: 'posts',
      data: {
        title: `Subfeed Post ${faker.string.alphanumeric(10).toLowerCase()}`,
        content: createRichText(faker.lorem.sentence()),
        type: 'discussion',
        user: user.id,
        feed: 'subfeed',
        subfeed: subfeed.id,
      },
      draft: false,
    })

    expect(post.feed).toBe('subfeed')
    expect(getRelationId(post.subfeed)).toBe(subfeed.id)
    expect(post.status).toBe('published')
  })

  it('rejects creating a link in subfeed feed without subfeed relation', async () => {
    const user = await getTestUser()

    await expect(
      payload.create({
        collection: 'links',
        data: {
          title: `Invalid Subfeed Link ${faker.string.alphanumeric(10).toLowerCase()}`,
          url: `https://example.com/${faker.string.alphanumeric(10).toLowerCase()}`,
          type: 'article',
          user: user.id,
          feed: 'subfeed',
          _status: 'published',
        },
        draft: false,
      }),
    ).rejects.toThrow('Links in subfeed feed must include a subfeed relation')
  })

  it('rejects creating a post in subfeed feed without subfeed relation', async () => {
    const user = await getTestUser()

    await expect(
      payload.create({
        collection: 'posts',
        data: {
          title: `Invalid Subfeed Post ${faker.string.alphanumeric(10).toLowerCase()}`,
          content: createRichText(faker.lorem.sentence()),
          type: 'discussion',
          user: user.id,
          feed: 'subfeed',
        },
        draft: false,
      }),
    ).rejects.toThrow('Posts in subfeed feed must include a subfeed relation')
  })

  it('rejects creating a link in subfeed feed when author is not a member', async () => {
    const owner = await getTestUser()
    const outsider = await createTestUser(payload)
    const subfeed = await createTestSubfeed(owner.id)

    await expect(
      payload.create({
        collection: 'links',
        data: {
          title: `Unauthorized Subfeed Link ${faker.string.alphanumeric(10).toLowerCase()}`,
          url: `https://example.com/${faker.string.alphanumeric(10).toLowerCase()}`,
          type: 'article',
          user: outsider.id,
          feed: 'subfeed',
          subfeed: subfeed.id,
          _status: 'published',
        },
        draft: false,
      }),
    ).rejects.toThrow('You must join this subfeed before posting')
  })

  it('rejects creating a post in subfeed feed when author is not a member', async () => {
    const owner = await getTestUser()
    const outsider = await createTestUser(payload)
    const subfeed = await createTestSubfeed(owner.id)

    await expect(
      payload.create({
        collection: 'posts',
        data: {
          title: `Unauthorized Subfeed Post ${faker.string.alphanumeric(10).toLowerCase()}`,
          content: createRichText(faker.lorem.sentence()),
          type: 'discussion',
          user: outsider.id,
          feed: 'subfeed',
          subfeed: subfeed.id,
        },
        draft: false,
      }),
    ).rejects.toThrow('You must join this subfeed before posting')
  })
})
