import { BasePayload, type Payload } from 'payload'
import { describe, it, beforeAll, expect, vi } from 'vitest'
import { faker } from '@faker-js/faker'

import {
  MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE,
  SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE,
  loadPublishingDestinationEligibility,
} from '@/lib/community/subfeeds'
import { getTestPayload, getTestUser } from '../utils/test-user'
import { createRichText, createSubfeedWithRoster, createTestUser } from './helpers'

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

interface TestSubfeedOpts {
  owner?: number
  moderators?: number[]
  editors?: number[]
  uploaders?: number[]
  members?: number[]
}

describe('Publishing destination pagination (pure)', () => {
  it('filters publishing roles before paging and includes eligible SubFeeds beyond 200', async () => {
    const user = { id: 21, roles: ['user'] }
    const subfeeds = Array.from({ length: 201 }, (_, index) => ({
      id: index + 1,
      name: `SubFeed ${index + 1}`,
      slug: `subfeed-${index + 1}`,
      uploaders: [user.id],
    }))
    const find = vi
      .fn()
      .mockResolvedValueOnce({ docs: subfeeds.slice(0, 200), hasNextPage: true })
      .mockResolvedValueOnce({ docs: subfeeds.slice(200), hasNextPage: false })
    const payloadStub = new BasePayload()
    payloadStub.find = find
    const eligibility = await loadPublishingDestinationEligibility(payloadStub, user)

    expect(eligibility.eligibleSubfeeds).toHaveLength(201)
    expect(eligibility.eligibleSubfeeds.at(-1)?.id).toBe(201)
    expect(find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        page: 1,
        user,
        overrideAccess: false,
        where: {
          or: [
            { owner: { equals: user.id } },
            { moderators: { in: [user.id] } },
            { editors: { in: [user.id] } },
            { uploaders: { in: [user.id] } },
          ],
        },
      }),
    )
    expect(find).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2 }))
  })
})

const createTestSubfeed = async (userId: number, opts: TestSubfeedOpts = {}) =>
  createSubfeedWithRoster(payload, { ownerId: userId, ...opts, prefix: 'test' })

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
      overrideAccess: true,
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
      overrideAccess: true,
    })

    expect(post.feed).toBe('subfeed')
    expect(getRelationId(post.subfeed)).toBe(subfeed.id)
    expect(post.status).toBe('published')

    // Verify partial update preserves subfeed relation and does not throw
    const updatedPost = await payload.update({
      collection: 'posts',
      id: post.id,
      data: {
        rankingScore: 42,
      },
      overrideAccess: true,
    })
    expect(updatedPost.feed).toBe('subfeed')
    expect(getRelationId(updatedPost.subfeed)).toBe(subfeed.id)
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
        overrideAccess: true,
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
        overrideAccess: true,
      }),
    ).rejects.toThrow('Posts in subfeed feed must include a subfeed relation')
  })

  it('rejects creating a link in subfeed feed when author has no local publishing role', async () => {
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
        overrideAccess: true,
      }),
    ).rejects.toThrow(SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE)
  })

  it('rejects creating a post in subfeed feed when author has no local publishing role', async () => {
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
        overrideAccess: true,
      }),
    ).rejects.toThrow(SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE)
  })

  it('rejects a joined member without a local publishing role creating SubFeed content', async () => {
    const owner = await createTestUser(payload)
    const joinedMember = await createTestUser(payload)
    const subfeed = await createTestSubfeed(owner.id, {
      members: [owner.id, joinedMember.id],
    })

    await expect(
      payload.create({
        collection: 'links',
        data: {
          title: `Joined Member Link ${faker.string.alphanumeric(10).toLowerCase()}`,
          url: `https://example.com/joined-${faker.string.alphanumeric(10).toLowerCase()}`,
          type: 'article',
          user: joinedMember.id,
          feed: 'subfeed',
          subfeed: subfeed.id,
          _status: 'published',
        },
        draft: false,
        user: joinedMember,
        overrideAccess: false,
      }),
    ).rejects.toThrow(SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE)

    await expect(
      payload.create({
        collection: 'posts',
        data: {
          title: `Joined Member Post ${faker.string.alphanumeric(10).toLowerCase()}`,
          content: createRichText(faker.lorem.sentence()),
          type: 'discussion',
          user: joinedMember.id,
          feed: 'subfeed',
          subfeed: subfeed.id,
        },
        draft: false,
        user: joinedMember,
        overrideAccess: false,
      }),
    ).rejects.toThrow(SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE)
  })

  it.each(['owner', 'moderator', 'editor', 'uploader'] as const)(
    'lets a local %s publish links and posts to their SubFeed only',
    async (role) => {
      const owner = await createTestUser(payload)
      const publisher = await createTestUser(payload)
      const reader = await createTestUser(payload)

      const roster: TestSubfeedOpts =
        role === 'owner'
          ? { owner: publisher.id, moderators: [owner.id], members: [owner.id, publisher.id] }
          : role === 'moderator'
            ? {
                owner: owner.id,
                moderators: [owner.id, publisher.id],
                members: [owner.id, publisher.id],
              }
            : role === 'editor'
              ? {
                  owner: owner.id,
                  moderators: [owner.id],
                  editors: [publisher.id],
                  members: [owner.id, publisher.id],
                }
              : {
                  owner: owner.id,
                  moderators: [owner.id],
                  uploaders: [publisher.id],
                  members: [owner.id, publisher.id],
                }

      const subfeed = await createTestSubfeed(owner.id, roster)
      const unrelated = await createTestSubfeed(owner.id)

      const link = await payload.create({
        collection: 'links',
        data: {
          title: `Local ${role} Link ${faker.string.alphanumeric(10).toLowerCase()}`,
          url: `https://example.com/local-${faker.string.alphanumeric(10).toLowerCase()}`,
          type: 'article',
          user: publisher.id,
          feed: 'subfeed',
          subfeed: subfeed.id,
          _status: 'published',
        },
        draft: false,
        user: publisher,
        overrideAccess: false,
      })

      const post = await payload.create({
        collection: 'posts',
        data: {
          title: `Local ${role} Post ${faker.string.alphanumeric(10).toLowerCase()}`,
          content: createRichText(faker.lorem.sentence()),
          type: 'discussion',
          user: publisher.id,
          feed: 'subfeed',
          subfeed: subfeed.id,
        },
        draft: false,
        user: publisher,
        overrideAccess: false,
      })

      expect(link.feed).toBe('subfeed')
      expect(link._status).toBe('published')
      expect(post.feed).toBe('subfeed')
      expect(post.status).toBe('published')

      // The freshly published items are publicly readable.
      const publicLinks = await payload.find({
        collection: 'links',
        where: { id: { equals: link.id } },
        user: reader,
        overrideAccess: false,
      })
      expect(publicLinks.docs).toHaveLength(1)

      const publicPosts = await payload.find({
        collection: 'posts',
        where: { id: { equals: post.id } },
        user: reader,
        overrideAccess: false,
      })
      expect(publicPosts.docs).toHaveLength(1)

      // Local authority does not leak into unrelated SubFeeds.
      await expect(
        payload.create({
          collection: 'links',
          data: {
            title: `Cross SubFeed ${faker.string.alphanumeric(10).toLowerCase()}`,
            url: `https://example.com/cross-${faker.string.alphanumeric(10).toLowerCase()}`,
            type: 'article',
            user: publisher.id,
            feed: 'subfeed',
            subfeed: unrelated.id,
            _status: 'published',
          },
          draft: false,
          user: publisher,
          overrideAccess: false,
        }),
      ).rejects.toThrow(SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE)

      // Local authority never grants Main Feed publishing.
      await expect(
        payload.create({
          collection: 'posts',
          data: {
            title: `Local Main ${faker.string.alphanumeric(10).toLowerCase()}`,
            content: createRichText(faker.lorem.sentence()),
            type: 'discussion',
            user: publisher.id,
            feed: 'main',
          },
          draft: false,
          user: publisher,
          overrideAccess: false,
        }),
      ).rejects.toThrow(MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE)
    },
  )

  it('persists moving a SubFeed link out to the Main Feed', async () => {
    const owner = await createTestUser(payload)
    const uploader = await createTestUser(payload)
    const sitePublisher = await getTestUser()
    const subfeed = await createTestSubfeed(owner.id, {
      uploaders: [uploader.id],
      members: [owner.id, uploader.id],
    })

    const link = await payload.create({
      collection: 'links',
      data: {
        title: `Move Out Link ${faker.string.alphanumeric(10).toLowerCase()}`,
        url: `https://example.com/move-out-${faker.string.alphanumeric(10).toLowerCase()}`,
        type: 'article',
        user: uploader.id,
        feed: 'subfeed',
        subfeed: subfeed.id,
        _status: 'published',
      },
      draft: false,
      user: uploader,
      overrideAccess: false,
    })
    expect(link.feed).toBe('subfeed')

    // `subfeed` is omitted deliberately: the destination change must detach it.
    const moved = await payload.update({
      collection: 'links',
      id: link.id,
      data: { feed: 'main' },
      user: sitePublisher,
      overrideAccess: false,
      depth: 0,
    })

    expect(moved.feed).toBe('main')
    expect(moved.subfeed).toBeNull()
  })

  it('allows subfeed moderator to edit subfeed profile fields', async () => {
    const owner = await getTestUser()
    const subfeed = await createTestSubfeed(owner.id)
    const unique = faker.string.alphanumeric(6).toLowerCase()

    const updated = await payload.update({
      collection: 'subfeeds',
      id: subfeed.id,
      data: {
        name: `Updated SubFeed ${unique}`,
        description: `Updated description for subfeed ${unique} with enough text`,
      },
      user: owner,
      overrideAccess: false,
      depth: 0,
    })

    expect(updated.name).toContain('Updated SubFeed')
    expect(updated.description).toContain('Updated description')
  })

  it('rejects subfeed profile edits by non-moderators', async () => {
    const owner = await getTestUser()
    const outsider = await createTestUser(payload)
    const subfeed = await createTestSubfeed(owner.id)

    await expect(
      payload.update({
        collection: 'subfeeds',
        id: subfeed.id,
        data: {
          description: `Outsider edit ${faker.string.alphanumeric(8).toLowerCase()}`,
        },
        user: outsider,
        overrideAccess: false,
        depth: 0,
      }),
    ).rejects.toThrow()
  })
})
