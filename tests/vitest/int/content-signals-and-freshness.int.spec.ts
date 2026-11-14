import { faker } from '@faker-js/faker'
import { Payload, Where } from 'payload'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { getTestPayload } from '../utils/test-user'
import { createRichText, createTestUser } from './helpers'
import {
  deriveLinkDiscoveryMomentum,
  isControversialFromRanking,
  recalculateTargetSignals,
} from '@/lib/community/contentSignals'
import {
  calculateRanking,
  computeLiveRankingScore,
  hasRankingScoreDrifted,
} from '@/lib/community/ranking'
import { refreshStaleContentRanking } from '@/lib/community/editorialPriority'
import { castContentVote, toggleContentBookmark } from '@/lib/community/interactions'

let payload: Payload

type ContentCollection = 'links' | 'posts'

const HOUR = 3_600_000

const unique = () => faker.string.alphanumeric(12).toLowerCase()

const createContent = async (
  collection: ContentCollection,
  data: Record<string, unknown> = {},
) => {
  const author = await createTestUser(payload)
  const common = {
    title: `Signals ${collection} ${unique()}`,
    user: author.id,
    feed: 'user' as const,
    ...data,
  }

  if (collection === 'links') {
    return payload.create({
      collection: 'links',
      data: {
        ...common,
        url: `https://example.com/${unique()}`,
        type: 'article',
        _status: 'published',
      },
      draft: false,
      overrideAccess: true,
    })
  }

  return payload.create({
    collection: 'posts',
    data: {
      ...common,
      content: createRichText('Signal recalculation fixture'),
      type: 'discussion',
      status: 'published',
    },
    overrideAccess: true,
  })
}

const findContent = async (collection: ContentCollection, id: number) =>
  payload.findByID({ collection, id, overrideAccess: true })

describe('Shared content signal helpers (pure)', () => {
  it('derives link discovery momentum from click volume', () => {
    expect(deriveLinkDiscoveryMomentum(0)).toBe(0)
    expect(deriveLinkDiscoveryMomentum(10)).toBe(3.5)
    expect(deriveLinkDiscoveryMomentum(-5)).toBe(0)
  })

  it('applies the canonical controversy rule', () => {
    expect(
      isControversialFromRanking({ controversyScore: 45, ragebaitProbability: 0 }),
    ).toBe(true)
    expect(
      isControversialFromRanking({ controversyScore: 0, ragebaitProbability: 0.6 }),
    ).toBe(true)
    expect(
      isControversialFromRanking({ controversyScore: 44, ragebaitProbability: 0.59 }),
    ).toBe(false)
  })
})

describe('Manual featured preservation (integration)', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it.each(['links', 'posts'] as const)(
    'keeps a moderator-set featured flag on %s when a vote recalculates signals',
    async (collection) => {
      const voter = await createTestUser(payload)
      const item = await createContent(collection, { featured: true })

      expect(item.featured).toBe(true)

      await castContentVote({
        payload,
        user: voter,
        targetCollection: collection,
        targetId: item.id,
        type: 'up',
      })

      const afterVote = await findContent(collection, item.id)
      expect(afterVote.featured).toBe(true)
      // Organic score stays below the 120 promotion threshold; the flag survives
      // purely because it was set manually.
      expect(afterVote.rankingScore).toBeLessThan(120)

      await recalculateTargetSignals({
        payload,
        targetCollection: collection,
        targetId: item.id,
      })

      const afterRecalculate = await findContent(collection, item.id)
      expect(afterRecalculate.featured).toBe(true)
    },
  )
})

describe('Injected clock handling (integration)', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it.each(['links', 'posts'] as const)(
    'honors the injected now clock for breaking and freshness decay on %s',
    async (collection) => {
      const item = await createContent(collection)

      await payload.update({
        collection,
        id: item.id,
        data: { sharesCount: 200 },
        overrideAccess: true,
      })

      const createdAt = new Date(item.createdAt)
      const earlyNow = new Date(createdAt.getTime() + 2 * HOUR)

      await recalculateTargetSignals({
        payload,
        targetCollection: collection,
        targetId: item.id,
        now: earlyNow,
      })

      const early = await findContent(collection, item.id)
      expect(early.breaking).toBe(true)
      expect(early.featured).toBe(true)

      const lateNow = new Date(createdAt.getTime() + 30 * HOUR)

      await recalculateTargetSignals({
        payload,
        targetCollection: collection,
        targetId: item.id,
        now: lateNow,
      })

      const late = await findContent(collection, item.id)
      expect(late.breaking).toBe(false)
      expect(late.rankingScore).toBeLessThan(early.rankingScore ?? 0)

      const expectedLate = calculateRanking({
        createdAt: item.createdAt,
        upvotes: 0,
        downvotes: 0,
        commentsCount: 0,
        sharesCount: 200,
        uniqueCommenters: 0,
        trustedInteractions: 0,
        discoveryMomentum: 0,
        feed: 'user',
        now: lateNow,
      })

      expect(late.rankingScore).toBe(expectedLate.score)
      expect(late.rankingScore).toBeCloseTo(30.25, 2)
    },
  )
})

describe('Live ranking freshness helpers', () => {
  const createdAt = new Date('2026-06-01T00:00:00Z').toISOString()
  const signals = {
    createdAt,
    upvotes: 10,
    downvotes: 1,
    commentsCount: 4,
    sharesCount: 2,
    uniqueCommenters: 3,
    trustedInteractions: 2,
    feed: 'user' as const,
  }

  it('computes the live ranking score for a reference clock', () => {
    const now = new Date('2026-06-01T06:00:00Z')

    expect(computeLiveRankingScore(signals, now)).toBe(calculateRanking({ ...signals, now }).score)
  })

  it('detects ranking-score drift caused by age decay', () => {
    const twoHoursIn = new Date('2026-06-01T02:00:00Z')
    const stored = computeLiveRankingScore(signals, twoHoursIn)

    expect(hasRankingScoreDrifted({ ...signals, rankingScore: stored }, { now: twoHoursIn })).toBe(
      false,
    )

    const nextDay = new Date('2026-06-02T00:00:00Z')
    expect(hasRankingScoreDrifted({ ...signals, rankingScore: stored }, { now: nextDay })).toBe(true)

    expect(hasRankingScoreDrifted({ ...signals, rankingScore: null }, { now: twoHoursIn })).toBe(
      true,
    )
    expect(
      hasRankingScoreDrifted(
        { ...signals, rankingScore: stored },
        { now: nextDay, tolerance: 10_000 },
      ),
    ).toBe(false)
  })

  it('reports drift against the persisted ranking score', async () => {
    payload = await getTestPayload()
    const item = await createContent('links')
    const createdAt = new Date(item.createdAt)
    const earlier = new Date(createdAt.getTime() + HOUR)

    await recalculateTargetSignals({
      payload,
      targetCollection: 'links',
      targetId: item.id,
      now: earlier,
    })

    const stored = await findContent('links', item.id)
    expect(stored.rankingScore).toBeTypeOf('number')

    const persisted = {
      createdAt: stored.createdAt,
      upvotes: stored.upvotes ?? 0,
      downvotes: stored.downvotes ?? 0,
      commentsCount: stored.commentsCount ?? 0,
      sharesCount: stored.sharesCount ?? 0,
      uniqueCommenters: stored.uniqueCommenters ?? 0,
      trustedInteractions: stored.trustedInteractions ?? 0,
      discoveryMomentum: stored.discoveryMomentum ?? 0,
      editorialPriority: stored.editorialPriority,
      editorialPriorityUntil: stored.editorialPriorityUntil,
      feed: stored.feed,
      rankingScore: stored.rankingScore,
    }

    expect(hasRankingScoreDrifted(persisted, { now: earlier })).toBe(false)
    expect(
      hasRankingScoreDrifted(persisted, { now: new Date(createdAt.getTime() + 20 * HOUR) }),
    ).toBe(true)
  })
})

describe('Shared vote and bookmark interactions (integration)', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it.each(['links', 'posts'] as const)(
    'toggles votes and bookmarks identically on %s',
    async (collection) => {
      const voter = await createTestUser(payload)
      const item = await createContent(collection)

      await castContentVote({
        payload,
        user: voter,
        targetCollection: collection,
        targetId: item.id,
        type: 'up',
      })

      const upvoted = await findContent(collection, item.id)
      expect(upvoted.votes).toBe(1)
      expect(upvoted.upvotes).toBe(1)

      // Casting the same vote again retracts it.
      await castContentVote({
        payload,
        user: voter,
        targetCollection: collection,
        targetId: item.id,
        type: 'up',
      })
      expect((await findContent(collection, item.id)).votes).toBe(0)

      await castContentVote({
        payload,
        user: voter,
        targetCollection: collection,
        targetId: item.id,
        type: 'down',
      })

      const downvoted = await findContent(collection, item.id)
      expect(downvoted.votes).toBe(-1)
      expect(downvoted.downvotes).toBe(1)

      expect(
        await toggleContentBookmark({
          payload,
          user: voter,
          targetCollection: collection,
          targetId: item.id,
        }),
      ).toEqual({ bookmarked: true })

      const targetWhere = (
        collection === 'links'
          ? { user: { equals: voter.id }, link: { equals: item.id } }
          : { user: { equals: voter.id }, post: { equals: item.id } }
      ) as Where
      expect(
        (
          await payload.find({
            collection: 'bookmarks',
            where: targetWhere,
            overrideAccess: true,
          })
        ).totalDocs,
      ).toBe(1)

      expect(
        await toggleContentBookmark({
          payload,
          user: voter,
          targetCollection: collection,
          targetId: item.id,
        }),
      ).toEqual({ bookmarked: false })

      expect(
        (
          await payload.find({
            collection: 'bookmarks',
            where: targetWhere,
            overrideAccess: true,
          })
        ).totalDocs,
      ).toBe(0)
    },
  )

  it('rejects unauthenticated interactions with the public error messages', async () => {
    const item = await createContent('links')

    await expect(
      castContentVote({
        payload,
        user: null,
        targetCollection: 'links',
        targetId: item.id,
        type: 'up',
      }),
    ).rejects.toThrow('You must be logged in to vote')

    await expect(
      toggleContentBookmark({
        payload,
        user: null,
        targetCollection: 'links',
        targetId: item.id,
      }),
    ).rejects.toThrow('You must be logged in to bookmark')
  })
})

/** Structural subset of a ranked content doc used to re-derive live scores. */
interface RankingDocLike {
  createdAt?: string | null
  upvotes?: number | null
  downvotes?: number | null
  commentsCount?: number | null
  sharesCount?: number | null
  uniqueCommenters?: number | null
  trustedInteractions?: number | null
  discoveryMomentum?: number | null
  clickCount?: number | null
  editorialPriority?: boolean | null
  editorialPriorityUntil?: string | null
  feed?: string | null
  rankingScore?: number | null
}

const rankingInputOf = (collection: ContentCollection, doc: unknown) => {
  const snapshot = doc as RankingDocLike

  return {
    createdAt: snapshot.createdAt,
    upvotes: snapshot.upvotes ?? 0,
    downvotes: snapshot.downvotes ?? 0,
    commentsCount: snapshot.commentsCount ?? 0,
    sharesCount: snapshot.sharesCount ?? 0,
    uniqueCommenters: snapshot.uniqueCommenters ?? 0,
    trustedInteractions: snapshot.trustedInteractions ?? 0,
    discoveryMomentum:
      collection === 'links'
        ? deriveLinkDiscoveryMomentum(snapshot.clickCount ?? 0)
        : (snapshot.discoveryMomentum ?? 0),
    editorialPriority: snapshot.editorialPriority,
    editorialPriorityUntil: snapshot.editorialPriorityUntil,
    feed: snapshot.feed,
    rankingScore: snapshot.rankingScore,
  }
}

const liveScoreOf = (collection: ContentCollection, doc: unknown, now: Date): number =>
  computeLiveRankingScore(rankingInputOf(collection, doc), now)

describe('Stale content ranking refresh sweep (integration)', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  const rankedSnapshot = (collection: ContentCollection, id: number) =>
    payload.find({
      collection,
      where: { id: { equals: id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

  const emptySnapshot = (collection: ContentCollection) =>
    payload.find({
      collection,
      where: { id: { equals: 0 } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

  /**
   * The sweep's own top-N query is stubbed so this test behaves the same on a
   * shared test database (the real query would return unrelated rows). Nested
   * recalculation queries (votes/comments/discoveries) still hit the database.
   */
  const sweepWithSnapshots = async (
    linksResult: Awaited<ReturnType<typeof emptySnapshot>>,
    postsResult: Awaited<ReturnType<typeof emptySnapshot>>,
    now: Date,
  ) => {
    const originalFind = payload.find.bind(payload) as (
      args: Record<string, unknown>,
    ) => Promise<unknown>
    const findSpy = vi.spyOn(payload, 'find')

    findSpy.mockImplementation(((args: { collection?: string }) => {
      if (args.collection === 'links') return Promise.resolve(linksResult)
      if (args.collection === 'posts') return Promise.resolve(postsResult)
      return originalFind(args as Record<string, unknown>)
    }) as unknown as typeof payload.find)

    try {
      return await refreshStaleContentRanking({ payload, now })
    } finally {
      findSpy.mockRestore()
    }
  }

  it.each(['links', 'posts'] as const)(
    'refreshes drifted %s rows found by the ranked sweep',
    async (collection) => {
      // A high share count keeps the fixture inside the sweep's top-N window.
      const item = await createContent(collection, { sharesCount: 400 })
      const staleScore = item.rankingScore ?? 0
      expect(staleScore).toBeGreaterThan(220)

      const now = new Date(new Date(item.createdAt).getTime() + 12 * HOUR)
      const result = await refreshStaleContentRanking({ payload, now, limit: 5 })
      expect(result.refreshed).toBeGreaterThanOrEqual(1)

      const refreshed = await findContent(collection, item.id)
      expect(refreshed.rankingScore).not.toBe(staleScore)
      expect(refreshed.rankingScore).toBeCloseTo(liveScoreOf(collection, refreshed, now), 2)
    },
  )

  it.each(['links', 'posts'] as const)(
    'reports drift for a stale %s snapshot and leaves a refreshed one untouched',
    async (collection) => {
      const item = await createContent(collection)
      const other: ContentCollection = collection === 'links' ? 'posts' : 'links'
      const now = new Date(new Date(item.createdAt).getTime() + 12 * HOUR)

      const staleSnapshot = await rankedSnapshot(collection, item.id)
      const otherSnapshot = await emptySnapshot(other)
      const staleDoc = staleSnapshot.docs[0]

      expect(hasRankingScoreDrifted(rankingInputOf(collection, staleDoc), { now })).toBe(true)
      expect(staleDoc.rankingScore).not.toBe(liveScoreOf(collection, staleDoc, now))

      const firstSweep =
        collection === 'links'
          ? await sweepWithSnapshots(staleSnapshot, otherSnapshot, now)
          : await sweepWithSnapshots(otherSnapshot, staleSnapshot, now)
      expect(firstSweep).toEqual({ refreshed: 1 })

      const refreshed = await findContent(collection, item.id)
      expect(refreshed.rankingScore).toBeCloseTo(liveScoreOf(collection, refreshed, now), 2)

      // The same clock immediately afterwards must find nothing left to do.
      const freshSnapshot = await rankedSnapshot(collection, item.id)
      const secondSweep =
        collection === 'links'
          ? await sweepWithSnapshots(freshSnapshot, otherSnapshot, now)
          : await sweepWithSnapshots(otherSnapshot, freshSnapshot, now)
      expect(secondSweep).toEqual({ refreshed: 0 })

      const after = await findContent(collection, item.id)
      expect(after.rankingScore).toBe(refreshed.rankingScore)
    },
  )
})
