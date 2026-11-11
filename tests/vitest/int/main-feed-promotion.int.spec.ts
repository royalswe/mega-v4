import { Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'
import { faker } from '@faker-js/faker'

import { getTestPayload } from '../utils/test-user'
import { createTestUser } from './helpers'
import {
  DISCOVERY_BOOST_INELIGIBLE_MESSAGE,
  DISCOVERY_BOOST_MIN_SCORE,
  DISCOVERY_BOOST_REQUIRED_MESSAGE,
  MAIN_FEED_PROMOTION_THRESHOLD,
  PROMOTION_DISCOVERY_MOMENTUM_MIN,
  PROMOTION_ENGAGEMENT_VELOCITY_MIN,
  buildMainFeedWhere,
  hasDiscoveryBoostStanding,
  isEligibleForMainFeedPromotion,
} from '@/lib/community/promotion'

let payload: Payload

const unique = () => faker.string.alphanumeric(10).toLowerCase()

const createRichText = (text: string) => ({
  root: {
    children: [
      {
        children: [
          {
            detail: 0 as const,
            format: 0 as const,
            mode: 'normal' as const,
            style: '',
            text,
            type: 'text' as const,
            version: 1 as const,
          },
        ],
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0,
        type: 'paragraph' as const,
        version: 1 as const,
        textFormat: 0 as const,
        textStyle: '',
      },
    ],
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    type: 'root' as const,
    version: 1,
  },
})

const createSubfeed = async (userId: number) => {
  const slug = `promotion-subfeed-${unique()}`
  return payload.create({
    collection: 'subfeeds',
    data: {
      name: `Promotion SubFeed ${slug}`,
      slug,
      description: `Integration test subfeed ${slug}`,
      moderators: [userId],
      members: [userId],
    },
    draft: false,
    overrideAccess: true,
  })
}

type LinkInput = {
  user: number
  feed: 'main' | 'user' | 'subfeed'
  subfeedId?: number
  upvotes?: number
  downvotes?: number
  featured?: boolean
  softDeleted?: boolean
  quarantined?: boolean
}

const createLink = async (input: LinkInput) => {
  const title = `Promotion Link ${unique()}`
  return payload.create({
    collection: 'links',
    data: {
      title,
      url: `https://example.com/${unique()}`,
      type: 'article',
      user: input.user,
      feed: input.feed,
      subfeed: input.subfeedId,
      upvotes: input.upvotes ?? 0,
      downvotes: input.downvotes ?? 0,
      featured: input.featured ?? false,
      softDeleted: input.softDeleted ?? false,
      quarantined: input.quarantined ?? false,
      _status: 'published',
    },
    draft: false,
    overrideAccess: true,
  })
}

type PostInput = {
  user: number
  feed: 'main' | 'user' | 'subfeed'
  subfeedId?: number
  upvotes?: number
  downvotes?: number
  featured?: boolean
  quarantined?: boolean
  status?: 'published' | 'pending' | 'removed'
}

const createPost = async (input: PostInput) => {
  const title = `Promotion Post ${unique()}`
  const post = await payload.create({
    collection: 'posts',
    data: {
      title,
      content: createRichText(faker.lorem.sentence()),
      type: 'discussion',
      user: input.user,
      feed: input.feed,
      subfeed: input.subfeedId,
      upvotes: input.upvotes ?? 0,
      downvotes: input.downvotes ?? 0,
      featured: input.featured ?? false,
      quarantined: input.quarantined ?? false,
    },
    overrideAccess: true,
  })

  // Posts default non-subfeed content to `pending`; force published so the
  // item can appear in a published main-feed query.
  if (input.status === 'published') {
    return payload.update({
      collection: 'posts',
      id: post.id,
      data: { status: 'published' },
      overrideAccess: true,
    })
  }

  return post
}

const queryLinks = async () => {
  const { docs } = await payload.find({
    collection: 'links',
    where: {
      and: [buildMainFeedWhere(), { _status: { equals: 'published' } }],
    },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  return docs
}

const queryPosts = async () => {
  const { docs } = await payload.find({
    collection: 'posts',
    where: {
      and: [buildMainFeedWhere({ collection: 'posts' }), { status: { equals: 'published' } }],
    },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  return docs
}

const ids = (docs: Array<{ id: number }>) => docs.map((doc) => doc.id)

describe('Main Feed promotion policy (pure)', () => {
  it('exposes calibrated thresholds', () => {
    expect(MAIN_FEED_PROMOTION_THRESHOLD).toEqual({ score: 4, upvotes: 5, rankingScore: 100 })
    expect(PROMOTION_DISCOVERY_MOMENTUM_MIN).toBe(5)
    expect(PROMOTION_ENGAGEMENT_VELOCITY_MIN).toBe(5)
    expect(DISCOVERY_BOOST_MIN_SCORE).toBe(60)
  })

  it('isEligibleForMainFeedPromotion accepts a qualifying subfeed item', () => {
    expect(
      isEligibleForMainFeedPromotion({
        feed: 'subfeed',
        score: 20,
        upvotes: 20,
        rankingScore: 128,
        engagementVelocity: 10,
      }),
    ).toBe(true)
  })

  it('isEligibleForMainFeedPromotion accepts a qualifying user-feed item', () => {
    expect(
      isEligibleForMainFeedPromotion({
        feed: 'user',
        score: 20,
        upvotes: 20,
        rankingScore: 128,
        discoveryMomentum: 6,
      }),
    ).toBe(true)
  })

  it('rejects main-feed native content (promotion is for non-main origins)', () => {
    expect(
      isEligibleForMainFeedPromotion({ feed: 'main', score: 100, upvotes: 100, rankingScore: 500 }),
    ).toBe(false)
  })

  it('rejects featured-but-controversial items (safety wins over the fast path)', () => {
    expect(isEligibleForMainFeedPromotion({ feed: 'subfeed', featured: true, controversial: true })).toBe(
      false,
    )
  })

  it('rejects soft-deleted and quarantined items regardless of featured', () => {
    expect(isEligibleForMainFeedPromotion({ feed: 'subfeed', featured: true, softDeleted: true })).toBe(
      false,
    )
    expect(isEligibleForMainFeedPromotion({ feed: 'subfeed', featured: true, quarantined: true })).toBe(
      false,
    )
  })

  it('does not treat discoveryBoosted as an organic eligibility factor', () => {
    expect(
      isEligibleForMainFeedPromotion({
        feed: 'subfeed',
        discoveryBoosted: true,
        score: 0,
        upvotes: 0,
        rankingScore: 0,
      }),
    ).toBe(false)
  })

  it('grants discovery boost standing at the calibrated decayed score', () => {
    // No `lastActiveAt` yields an exact decay factor of 1.
    expect(hasDiscoveryBoostStanding({ discoveryScore: 60 })).toBe(true)
    expect(hasDiscoveryBoostStanding({ discoveryScore: 59 })).toBe(false)
  })

  it('decays discovery standing with recency', () => {
    const recent = new Date().toISOString()
    const stale = new Date(Date.now() - 200 * 86_400_000).toISOString()
    expect(hasDiscoveryBoostStanding({ discoveryScore: 120, lastActiveAt: recent })).toBe(true)
    expect(hasDiscoveryBoostStanding({ discoveryScore: 120, lastActiveAt: stale })).toBe(false)
  })
})

describe('Main Feed promotion integration', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('promotes qualifying subfeed and user-feed links into the Main Feed query', async () => {
    const user = await createTestUser(payload)
    const subfeed = await createSubfeed(user.id)

    const qualifyingSubfeed = await createLink({
      user: user.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      upvotes: 20,
    })
    const qualifyingUserFeed = await createLink({ user: user.id, feed: 'user', upvotes: 20 })
    const ineligible = await createLink({ user: user.id, feed: 'user', upvotes: 0 })

    const promotedIds = ids(await queryLinks())

    expect(promotedIds).toContain(qualifyingSubfeed.id)
    expect(promotedIds).toContain(qualifyingUserFeed.id)
    expect(promotedIds).not.toContain(ineligible.id)
  })

  it('promotes qualifying subfeed and user-feed posts into the Main Feed query', async () => {
    const user = await createTestUser(payload)
    const subfeed = await createSubfeed(user.id)

    const qualifyingSubfeed = await createPost({
      user: user.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      upvotes: 20,
      status: 'published',
    })
    const qualifyingUserFeed = await createPost({
      user: user.id,
      feed: 'user',
      upvotes: 20,
      status: 'published',
    })
    const ineligible = await createPost({
      user: user.id,
      feed: 'user',
      upvotes: 0,
      status: 'published',
    })

    const promotedIds = ids(await queryPosts())

    expect(promotedIds).toContain(qualifyingSubfeed.id)
    expect(promotedIds).toContain(qualifyingUserFeed.id)
    expect(promotedIds).not.toContain(ineligible.id)
  })

  it('excludes featured-but-controversial links from Main Feed promotion', async () => {
    const user = await createTestUser(payload)
    const subfeed = await createSubfeed(user.id)

    const controversial = await createLink({
      user: user.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      upvotes: 10,
      downvotes: 10,
      featured: true,
    })

    expect(controversial.controversial).toBe(true)
    expect(isEligibleForMainFeedPromotion(controversial)).toBe(false)

    const promotedIds = ids(await queryLinks())
    expect(promotedIds).not.toContain(controversial.id)
  })

  it('excludes soft-deleted and quarantined items from Main Feed promotion', async () => {
    const user = await createTestUser(payload)
    const subfeed = await createSubfeed(user.id)

    const softDeleted = await createLink({
      user: user.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      upvotes: 20,
      featured: true,
      softDeleted: true,
    })
    const quarantined = await createLink({
      user: user.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      upvotes: 20,
      featured: true,
      quarantined: true,
    })

    const promotedIds = ids(await queryLinks())
    expect(promotedIds).not.toContain(softDeleted.id)
    expect(promotedIds).not.toContain(quarantined.id)
  })

  it('lets a discovery-standing member boost a qualifying item', async () => {
    const author = await createTestUser(payload)
    const booster = await createTestUser(payload)
    await payload.update({
      collection: 'users',
      id: booster.id,
      data: { discoveryScore: 80, lastActiveAt: new Date().toISOString() },
      overrideAccess: true,
    })
    const subfeed = await createSubfeed(author.id)

    const link = await createLink({
      user: author.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      upvotes: 20,
    })

    const boosted = await payload.update({
      collection: 'links',
      id: link.id,
      data: {
        discoveryBoosted: true,
        boostedAt: new Date().toISOString(),
        boostedBy: booster.id,
      },
      overrideAccess: true,
      context: { discoveryBoost: { userId: booster.id } },
    })

    expect(boosted.discoveryBoosted).toBe(true)
    const boostedById =
      typeof boosted.boostedBy === 'number'
        ? boosted.boostedBy
        : (boosted.boostedBy as { id?: number } | null | undefined)?.id
    expect(boostedById).toBe(booster.id)

    const promotedIds = ids(await queryLinks())
    expect(promotedIds).toContain(link.id)
  })

  it('rejects a member without discovery standing from boosting', async () => {
    const author = await createTestUser(payload)
    const ineligible = await createTestUser(payload)
    const subfeed = await createSubfeed(author.id)

    const link = await createLink({
      user: author.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      upvotes: 20,
    })

    await expect(
      payload.update({
        collection: 'links',
        id: link.id,
        data: {
          discoveryBoosted: true,
          boostedAt: new Date().toISOString(),
          boostedBy: ineligible.id,
        },
        overrideAccess: true,
        context: { discoveryBoost: { userId: ineligible.id } },
      }),
    ).rejects.toThrow(DISCOVERY_BOOST_REQUIRED_MESSAGE)
  })

  it('rejects boosting a controversial item', async () => {
    const author = await createTestUser(payload)
    const booster = await createTestUser(payload)
    await payload.update({
      collection: 'users',
      id: booster.id,
      data: { discoveryScore: 80, lastActiveAt: new Date().toISOString() },
      overrideAccess: true,
    })
    const subfeed = await createSubfeed(author.id)

    const controversial = await createLink({
      user: author.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      upvotes: 10,
      downvotes: 10,
    })

    expect(controversial.controversial).toBe(true)

    await expect(
      payload.update({
        collection: 'links',
        id: controversial.id,
        data: {
          discoveryBoosted: true,
          boostedAt: new Date().toISOString(),
          boostedBy: booster.id,
        },
        overrideAccess: true,
        context: { discoveryBoost: { userId: booster.id } },
      }),
    ).rejects.toThrow(DISCOVERY_BOOST_INELIGIBLE_MESSAGE)
  })

  it('rejects a non-moderator from setting boost fields directly (hook guard)', async () => {
    const author = await createTestUser(payload)
    const subfeed = await createSubfeed(author.id)

    const link = await createLink({
      user: author.id,
      feed: 'subfeed',
      subfeedId: subfeed.id,
      upvotes: 20,
    })

    await expect(
      payload.update({
        collection: 'links',
        id: link.id,
        data: { discoveryBoosted: true },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/Only site administrators, moderators, and editors/)
  })

  it('accepts echoed boost values but rejects unauthorized changes and clears', async () => {
    const author = await createTestUser(payload)
    const admin = await payload.update({
      collection: 'users',
      id: author.id,
      data: { roles: ['admin', 'user'] },
      overrideAccess: true,
    })
    const link = await createLink({ user: author.id, feed: 'user', upvotes: 20 })
    const boosted = await payload.update({
      collection: 'links',
      id: link.id,
      data: {
        discoveryBoosted: true,
        boostedAt: new Date().toISOString(),
        boostedBy: author.id,
      },
      user: admin,
      overrideAccess: false,
      depth: 0,
    })
    const echoed = await payload.update({
      collection: 'links',
      id: link.id,
      data: {
        description: 'Routine update',
        discoveryBoosted: boosted.discoveryBoosted,
        boostedAt: boosted.boostedAt,
        boostedBy: boosted.boostedBy,
      },
      overrideAccess: true,
    })
    expect(echoed.discoveryBoosted).toBe(true)

    for (const data of [
      { discoveryBoosted: false },
      { boostedAt: null },
      { boostedBy: null },
      { boostedAt: new Date(Date.now() + 60_000).toISOString() },
    ]) {
      await expect(
        payload.update({
          collection: 'links',
          id: link.id,
          data,
          overrideAccess: true,
        }),
      ).rejects.toThrow(/Only site administrators, moderators, and editors/)
    }
  })
})
