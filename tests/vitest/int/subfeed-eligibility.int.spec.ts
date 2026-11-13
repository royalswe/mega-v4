import { Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'
import { faker } from '@faker-js/faker'

import { getTestPayload } from '../utils/test-user'
import { createTestUser } from './helpers'
import {
  SUBFEED_CREATION_INELIGIBLE_MESSAGE,
  SUBFEED_CREATION_LOCKED_MESSAGE,
  SUBFEED_STRONG_RECRUITER_THRESHOLD,
  assertSubfeedCreationEligible,
  evaluateSubfeedEligibility,
  getSubfeedEligibilityForUser,
} from '@/lib/community/subfeedEligibility'
import {
  FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE,
  MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE,
  SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE,
  derivePersistedPublicationState,
} from '@/lib/community/subfeeds'

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

describe('SubFeed creation eligibility (pure)', () => {
  it('qualifies a member with uploader candidacy', () => {
    const result = evaluateSubfeedEligibility({ signals: { contributionScore: 90 } })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toContain('uploader-candidacy')
  })

  it('qualifies a member with strong recruiter standing', () => {
    const result = evaluateSubfeedEligibility({ signals: { recruiterScore: 60 } })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toContain('strong-recruiter')
  })

  it('qualifies a member who holds the uploader role', () => {
    const result = evaluateSubfeedEligibility({
      signals: { contributionScore: 0 },
      roles: ['user', 'uploader'],
    })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toContain('uploader-candidacy')
  })

  it('qualifies a site admin regardless of signals', () => {
    const result = evaluateSubfeedEligibility({
      signals: {},
      roles: ['admin', 'user'],
    })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toContain('admin')
  })

  it('qualifies a member with editor candidacy', () => {
    const result = evaluateSubfeedEligibility({
      signals: { contributionScore: 200, interactionScore: 50 },
    })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toContain('editor-candidacy')
  })

  it('rejects a fresh account with no standing', () => {
    const result = evaluateSubfeedEligibility({ signals: {} })
    expect(result.eligible).toBe(false)
    expect(result.locked).toBe(false)
    expect(result.missing).toEqual([
      'uploader-candidacy',
      'editor-candidacy',
      'strong-recruiter',
      'community-standing',
    ])
  })

  it('qualifies high Contribution + Likability community standing', () => {
    const result = evaluateSubfeedEligibility({
      signals: { contributionScore: 90, likabilityScore: 50 },
    })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toContain('community-standing')
  })

  it('does not grant community standing on Contribution alone', () => {
    const result = evaluateSubfeedEligibility({
      signals: { contributionScore: 200, likabilityScore: 0 },
    })
    expect(result.reasons).not.toContain('community-standing')
  })

  it('applies the relative-rank gate when population context is supplied', () => {
    const qualified = evaluateSubfeedEligibility({
      signals: { contributionScore: 90, likabilityScore: 50 },
      population: { totalActiveMembers: 100, membersAhead: 5 },
    })
    expect(qualified.reasons).toContain('community-standing')

    const crowded = evaluateSubfeedEligibility({
      signals: { contributionScore: 90, likabilityScore: 50 },
      population: { totalActiveMembers: 100, membersAhead: 50 },
    })
    expect(crowded.reasons).not.toContain('community-standing')
  })

  it('rejects a member just below the uploader candidacy threshold', () => {
    // 83 Contribution Points is one short of the 84-point solo candidacy gate.
    const result = evaluateSubfeedEligibility({ signals: { contributionScore: 83 } })
    expect(result.eligible).toBe(false)
    expect(result.progress.find((p) => p.requirement === 'uploader-candidacy')?.met).toBe(false)
  })

  it('blocks a frozen standing even when the member would otherwise qualify', () => {
    const result = evaluateSubfeedEligibility({
      signals: { contributionScore: 200 },
      roles: ['user', 'uploader'],
      standingLocked: true,
    })
    expect(result.eligible).toBe(false)
    expect(result.locked).toBe(true)
  })

  it('blocks a candidacy path whose role was revoked by an admin', () => {
    // 120 Contribution Points clears the uploader solo candidacy gate (84)...
    const withoutRevocation = evaluateSubfeedEligibility({ signals: { contributionScore: 120 } })
    expect(withoutRevocation.reasons).toContain('uploader-candidacy')

    // ...but an admin-revoked uploader role removes uploader candidacy entirely.
    const result = evaluateSubfeedEligibility({
      signals: { contributionScore: 120 },
      roles: ['user', 'uploader'],
      revokedRoles: ['uploader'],
    })
    expect(result.eligible).toBe(false)
    expect(result.reasons).not.toContain('uploader-candidacy')
    expect(result.progress.find((p) => p.requirement === 'uploader-candidacy')?.met).toBe(false)
  })

  it('still allows other candidacy paths when only one role was revoked', () => {
    const result = evaluateSubfeedEligibility({
      signals: { contributionScore: 200 },
      revokedRoles: ['uploader'],
    })
    // 200 Contribution clears the editor solo candidacy gate (196).
    expect(result.eligible).toBe(true)
    expect(result.reasons).toContain('editor-candidacy')
    expect(result.reasons).not.toContain('uploader-candidacy')
  })

  it('exposes the calibrated strong recruiter threshold', () => {
    expect(SUBFEED_STRONG_RECRUITER_THRESHOLD).toBe(60)
  })
})

describe('SubFeed creation eligibility integration', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getTestPayload()
  })

  const createEligibleUser = async () => {
    const user = await createTestUser(payload)
    return payload.update({
      collection: 'users',
      id: user.id,
      data: { contributionScore: 120, lastActiveAt: new Date().toISOString() },
      overrideAccess: true,
    })
  }

  it('allows an eligible member to create a SubFeed', async () => {
    const user = await createEligibleUser()
    const unique = faker.string.alphanumeric(8).toLowerCase()

    const subfeed = await payload.create({
      collection: 'subfeeds',
      data: {
        name: `Eligible SubFeed ${unique}`,
        slug: `eligible-subfeed-${unique}`,
        description: `Created by an eligible member ${unique}`,
        moderators: [user.id],
        members: [user.id],
      },
      user,
      overrideAccess: false,
    })

    expect(subfeed.id).toBeDefined()
    expect(subfeed.slug).toBe(`eligible-subfeed-${unique}`)
  })

  it('rejects an ineligible member from creating a SubFeed at the collection level', async () => {
    const user = await createTestUser(payload)
    const unique = faker.string.alphanumeric(8).toLowerCase()

    await expect(
      payload.create({
        collection: 'subfeeds',
        data: {
          name: `Ineligible SubFeed ${unique}`,
          slug: `ineligible-subfeed-${unique}`,
          description: `Created by an ineligible member ${unique}`,
          moderators: [user.id],
          members: [user.id],
        },
        user,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('rejects an ineligible member via the server-action guard with an informative error', async () => {
    const user = await createTestUser(payload)

    await expect(assertSubfeedCreationEligible(payload, user.id)).rejects.toThrow(
      SUBFEED_CREATION_INELIGIBLE_MESSAGE,
    )
  })

  it('rejects a frozen-standing member with the locked message', async () => {
    const user = await createTestUser(payload)
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { contributionScore: 200, standingLocked: true },
      overrideAccess: true,
    })

    await expect(assertSubfeedCreationEligible(payload, user.id)).rejects.toThrow(
      SUBFEED_CREATION_LOCKED_MESSAGE,
    )
  })

  it('rejects a member whose candidacy roles were all revoked despite qualifying scores', async () => {
    const user = await createTestUser(payload)
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        contributionScore: 200,
        revokedRoles: ['uploader', 'editor', 'recruiter'],
        lastActiveAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })

    // 200 Contribution would clear both the uploader (84) and editor (196)
    // solo candidacy gates, but every path was revoked by an admin.
    await expect(assertSubfeedCreationEligible(payload, user.id)).rejects.toThrow(
      SUBFEED_CREATION_INELIGIBLE_MESSAGE,
    )
  })

  it('passes the guard for an eligible member', async () => {
    const user = await createEligibleUser()
    const result = await assertSubfeedCreationEligible(payload, user.id)
    expect(result.eligible).toBe(true)
  })

  it('still lets an ineligible member publish to their User Feed', async () => {
    const user = await createTestUser(payload)
    const otherReader = await createTestUser(payload)
    const unique = faker.string.alphanumeric(10).toLowerCase()

    // Regression guard: the user must still be ineligible for SubFeed creation.
    const eligibility = await getSubfeedEligibilityForUser(payload, user.id)
    expect(eligibility?.eligible).toBe(false)

    const post = await payload.create({
      collection: 'posts',
      data: {
        title: `User Feed Post ${unique}`,
        content: createRichText('Still publishing to my own feed.'),
        type: 'discussion',
        user: user.id,
        feed: 'user',
      },
      user,
      overrideAccess: false,
    })

    const link = await payload.create({
      collection: 'links',
      data: {
        title: `User Feed Link ${unique}`,
        url: `https://example.com/user-feed-${unique}`,
        type: 'article',
        user: user.id,
        feed: 'user',
      },
      user,
      overrideAccess: false,
    })

    expect(post.id).toBeDefined()
    expect(post.feed).toBe('user')
    expect(post.status).toBe('published')
    expect(link.id).toBeDefined()
    expect(link.feed).toBe('user')
    expect(link._status).toBe('published')

    // Personal content is publicly readable, both anonymously and by peers.
    for (const collection of ['links', 'posts'] as const) {
      const id = collection === 'links' ? link.id : post.id

      const anonymous = await payload.find({
        collection,
        where: { id: { equals: id } },
        overrideAccess: false,
      })
      expect(anonymous.docs).toHaveLength(1)

      const peer = await payload.find({
        collection,
        where: { id: { equals: id } },
        user: otherReader,
        overrideAccess: false,
      })
      expect(peer.docs).toHaveLength(1)
    }
  })

  it('rejects an ordinary member creating a link or post in the Main Feed', async () => {
    const user = await createTestUser(payload)
    const unique = faker.string.alphanumeric(10).toLowerCase()

    await expect(
      payload.create({
        collection: 'links',
        data: {
          title: `Main Feed Link ${unique}`,
          url: `https://example.com/main-feed-${unique}`,
          type: 'article',
          user: user.id,
          feed: 'main',
        },
        draft: false,
        user,
        overrideAccess: false,
      }),
    ).rejects.toThrow(MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE)

    await expect(
      payload.create({
        collection: 'posts',
        data: {
          title: `Main Feed Post ${unique}`,
          content: createRichText('I should not reach the Main Feed.'),
          type: 'discussion',
          user: user.id,
          feed: 'main',
        },
        draft: false,
        user,
        overrideAccess: false,
      }),
    ).rejects.toThrow(MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE)
  })

  it('rejects an ordinary member publishing under another member identity', async () => {
    const user = await createTestUser(payload)
    const otherUser = await createTestUser(payload)
    const unique = faker.string.alphanumeric(10).toLowerCase()

    await expect(
      payload.create({
        collection: 'links',
        data: {
          title: `Foreign Author Link ${unique}`,
          url: `https://example.com/foreign-${unique}`,
          type: 'article',
          user: otherUser.id,
          feed: 'user',
        },
        draft: false,
        user,
        overrideAccess: false,
      }),
    ).rejects.toThrow(FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE)

    await expect(
      payload.create({
        collection: 'posts',
        data: {
          title: `Foreign Author Post ${unique}`,
          content: createRichText('This author is not me.'),
          type: 'discussion',
          user: otherUser.id,
          feed: 'user',
        },
        draft: false,
        user,
        overrideAccess: false,
      }),
    ).rejects.toThrow(FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE)
  })

  it('rejects an ordinary member retargeting their own User Feed content', async () => {
    const user = await createTestUser(payload)
    const otherUser = await createTestUser(payload)
    const unique = faker.string.alphanumeric(10).toLowerCase()

    const owner = await createTestUser(payload)
    const subfeed = await payload.create({
      collection: 'subfeeds',
      data: {
        name: `Eligibility Target ${unique}`,
        slug: `eligibility-target-${unique}`,
        description: `Foreign subfeed for retargeting ${unique}`,
        owner: owner.id,
        moderators: [owner.id],
        members: [owner.id],
      },
      overrideAccess: true,
    })

    const link = await payload.create({
      collection: 'links',
      data: {
        title: `Retarget Link ${unique}`,
        url: `https://example.com/retarget-${unique}`,
        type: 'article',
        user: user.id,
        feed: 'user',
      },
      user,
      overrideAccess: false,
    })

    const post = await payload.create({
      collection: 'posts',
      data: {
        title: `Retarget Post ${unique}`,
        content: createRichText('Owned personal post.'),
        type: 'discussion',
        user: user.id,
        feed: 'user',
      },
      user,
      overrideAccess: false,
    })

    for (const collection of ['links', 'posts'] as const) {
      const id = collection === 'links' ? link.id : post.id

      await expect(
        payload.update({
          collection,
          id,
          data: { feed: 'main' },
          user,
          overrideAccess: false,
        }),
      ).rejects.toThrow(MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE)

      await expect(
        payload.update({
          collection,
          id,
          data: { feed: 'subfeed', subfeed: subfeed.id },
          user,
          overrideAccess: false,
        }),
      ).rejects.toThrow(SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE)

      await expect(
        payload.update({
          collection,
          id,
          data: { user: otherUser.id },
          user,
          overrideAccess: false,
        }),
      ).rejects.toThrow(FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE)
    }

    // The attempted retargets did not persist.
    const reloadedLink = await payload.findByID({
      collection: 'links',
      id: link.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(reloadedLink.feed).toBe('user')
    expect(reloadedLink.user).toBe(user.id)

    const reloadedPost = await payload.findByID({
      collection: 'posts',
      id: post.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(reloadedPost.feed).toBe('user')
    expect(reloadedPost.user).toBe(user.id)
  })

  it('keeps an explicit draft create unpublished', async () => {
    const user = await createTestUser(payload)
    const unique = faker.string.alphanumeric(10).toLowerCase()

    const draftByFlag = await payload.create({
      collection: 'links',
      data: {
        title: `Explicit Draft Flag ${unique}`,
        url: `https://example.com/draft-flag-${unique}`,
        type: 'article',
        user: user.id,
        feed: 'user',
      },
      draft: true,
      user,
      overrideAccess: false,
    })

    const draftByStatus = await payload.create({
      collection: 'links',
      data: {
        title: `Explicit Draft Status ${unique}`,
        url: `https://example.com/draft-status-${unique}`,
        type: 'article',
        user: user.id,
        feed: 'user',
        _status: 'draft',
      },
      draft: false,
      user,
      overrideAccess: false,
    })

    expect(draftByFlag._status).toBe('draft')
    expect(draftByStatus._status).toBe('draft')

    const anonymous = await payload.find({
      collection: 'links',
      where: { id: { in: [draftByFlag.id, draftByStatus.id] } },
      overrideAccess: false,
    })
    expect(anonymous.docs).toHaveLength(0)
  })

  it('does not let an ordinary author self-publish a draft link', async () => {
    const user = await createTestUser(payload)
    const unique = faker.string.alphanumeric(10).toLowerCase()

    const draft = await payload.create({
      collection: 'links',
      data: {
        title: `Author Draft ${unique}`,
        url: `https://example.com/author-draft-${unique}`,
        type: 'article',
        user: user.id,
        feed: 'user',
      },
      draft: true,
      user,
      overrideAccess: false,
    })
    expect(draft._status).toBe('draft')

    await payload.update({
      collection: 'links',
      id: draft.id,
      data: { _status: 'published' },
      user,
      overrideAccess: false,
    })

    const reloaded = await payload.findByID({
      collection: 'links',
      id: draft.id,
      draft: true,
      depth: 0,
      overrideAccess: true,
    })
    expect(reloaded._status).toBe('draft')
  })

  it('ignores a member attempting to self-feature their own content', async () => {
    const user = await createTestUser(payload)
    const unique = faker.string.alphanumeric(10).toLowerCase()

    const link = await payload.create({
      collection: 'links',
      data: {
        title: `Self Featured Link ${unique}`,
        url: `https://example.com/self-featured-${unique}`,
        type: 'article',
        user: user.id,
        feed: 'user',
        featured: true,
      },
      draft: false,
      user,
      overrideAccess: false,
    })

    const post = await payload.create({
      collection: 'posts',
      data: {
        title: `Self Featured Post ${unique}`,
        content: createRichText('Trying to feature myself.'),
        type: 'discussion',
        user: user.id,
        feed: 'user',
        featured: true,
      },
      draft: false,
      user,
      overrideAccess: false,
    })

    expect(link.featured).toBe(false)
    expect(post.featured).toBe(false)
  })
})

describe('Personal publication outcomes (#25)', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getTestPayload()
  })

  /**
   * Mirrors how `submitLink` / `submitPost` derive the caller-visible outcome
   * from the persisted document. The server actions themselves are not
   * reachable from Vitest, so the assertions are driven by real collection
   * reads instead of by the requested destination.
   */
  const describePersistedOutcome = (
    kind: 'link' | 'post',
    doc: {
      id: number
      _status?: unknown
      status?: unknown
      softDeleted?: unknown
      quarantined?: unknown
    },
    username: string,
  ) => {
    const visibility = derivePersistedPublicationState(kind, doc)

    return {
      visibility,
      isPublic: visibility === 'published',
      itemHref: visibility === 'blocked' ? null : `/${kind}/${doc.id}`,
      destinationHref: `/user/${encodeURIComponent(username)}?tab=${kind === 'link' ? 'links' : 'posts'}`,
    }
  }

  const readAsAnonymous = async (collection: 'links' | 'posts', id: number) => {
    const result = await payload.find({
      collection,
      where: { id: { equals: id } },
      overrideAccess: false,
    })
    return result.docs.length
  }

  const readAsAuthor = async (
    collection: 'links' | 'posts',
    id: number,
    author: Awaited<ReturnType<typeof createTestUser>>,
  ) => {
    const result = await payload.find({
      collection,
      where: { id: { equals: id } },
      user: author,
      overrideAccess: false,
    })
    return result.docs.length
  }

  it('reports published personal links and posts with a direct item path', async () => {
    const user = await createTestUser(payload)
    const unique = faker.string.alphanumeric(10).toLowerCase()

    const link = await payload.create({
      collection: 'links',
      data: {
        title: `Outcome Published Link ${unique}`,
        url: `https://example.com/outcome-published-${unique}`,
        type: 'article',
        user: user.id,
        feed: 'user',
      },
      user,
      overrideAccess: false,
    })

    const post = await payload.create({
      collection: 'posts',
      data: {
        title: `Outcome Published Post ${unique}`,
        content: createRichText('Published to my own User Feed.'),
        type: 'discussion',
        user: user.id,
        feed: 'user',
      },
      user,
      overrideAccess: false,
    })

    expect(link._status).toBe('published')
    expect(post.status).toBe('published')

    expect(describePersistedOutcome('link', link, user.username)).toEqual({
      visibility: 'published',
      isPublic: true,
      itemHref: `/link/${link.id}`,
      destinationHref: `/user/${encodeURIComponent(user.username)}?tab=links`,
    })

    expect(describePersistedOutcome('post', post, user.username)).toEqual({
      visibility: 'published',
      isPublic: true,
      itemHref: `/post/${post.id}`,
      destinationHref: `/user/${encodeURIComponent(user.username)}?tab=posts`,
    })

    expect(await readAsAnonymous('links', link.id)).toBe(1)
    expect(await readAsAnonymous('posts', post.id)).toBe(1)
  })

  it('keeps pending personal items non-public while the author can still read them', async () => {
    const user = await createTestUser(payload)
    const unique = faker.string.alphanumeric(10).toLowerCase()

    // `recordDraftIntent` (beforeOperation) records explicit draft intent, so
    // `draft: true` survives the personal-first publish defaults.
    const pendingLink = await payload.create({
      collection: 'links',
      data: {
        title: `Outcome Pending Link ${unique}`,
        url: `https://example.com/outcome-pending-${unique}`,
        type: 'article',
        user: user.id,
        feed: 'user',
      },
      draft: true,
      user,
      overrideAccess: false,
    })

    const pendingPost = await payload.create({
      collection: 'posts',
      data: {
        title: `Outcome Pending Post ${unique}`,
        content: createRichText('Saved for review.'),
        type: 'discussion',
        user: user.id,
        feed: 'user',
      },
      context: { forcePending: true },
      user,
      overrideAccess: false,
    })

    expect(pendingLink._status).toBe('draft')
    expect(pendingPost.status).toBe('pending')

    const linkOutcome = describePersistedOutcome('link', pendingLink, user.username)
    expect(linkOutcome.visibility).toBe('pending')
    expect(linkOutcome.isPublic).toBe(false)
    expect(linkOutcome.itemHref).toBe(`/link/${pendingLink.id}`)

    const postOutcome = describePersistedOutcome('post', pendingPost, user.username)
    expect(postOutcome.visibility).toBe('pending')
    expect(postOutcome.isPublic).toBe(false)
    expect(postOutcome.itemHref).toBe(`/post/${pendingPost.id}`)

    expect(await readAsAnonymous('links', pendingLink.id)).toBe(0)
    expect(await readAsAnonymous('posts', pendingPost.id)).toBe(0)
    expect(await readAsAuthor('links', pendingLink.id, user)).toBe(1)
    expect(await readAsAuthor('posts', pendingPost.id, user)).toBe(1)
  })

  it('reports blocked personal items without an item path and hides them from the author', async () => {
    const user = await createTestUser(payload)
    const unique = faker.string.alphanumeric(10).toLowerCase()

    const publishedLink = await payload.create({
      collection: 'links',
      data: {
        title: `Outcome Blocked Link ${unique}`,
        url: `https://example.com/outcome-blocked-${unique}`,
        type: 'article',
        user: user.id,
        feed: 'user',
      },
      user,
      overrideAccess: false,
    })

    const publishedPost = await payload.create({
      collection: 'posts',
      data: {
        title: `Outcome Blocked Post ${unique}`,
        content: createRichText('Removed after a moderation decision.'),
        type: 'discussion',
        user: user.id,
        feed: 'user',
      },
      user,
      overrideAccess: false,
    })

    // Moderation fields are moderator-only, so a moderator applies them.
    await payload.update({
      collection: 'links',
      id: publishedLink.id,
      data: { quarantined: true },
      overrideAccess: true,
    })

    await payload.update({
      collection: 'posts',
      id: publishedPost.id,
      data: { status: 'removed' },
      overrideAccess: true,
    })

    const blockedLink = await payload.findByID({
      collection: 'links',
      id: publishedLink.id,
      depth: 0,
      draft: true,
      overrideAccess: true,
    })

    const blockedPost = await payload.findByID({
      collection: 'posts',
      id: publishedPost.id,
      depth: 0,
      overrideAccess: true,
    })

    expect(blockedLink.quarantined).toBe(true)
    expect(blockedPost.status).toBe('removed')

    const linkOutcome = describePersistedOutcome('link', blockedLink, user.username)
    expect(linkOutcome.visibility).toBe('blocked')
    expect(linkOutcome.isPublic).toBe(false)
    expect(linkOutcome.itemHref).toBeNull()

    const postOutcome = describePersistedOutcome('post', blockedPost, user.username)
    expect(postOutcome.visibility).toBe('blocked')
    expect(postOutcome.isPublic).toBe(false)
    expect(postOutcome.itemHref).toBeNull()

    // Even the non-moderator author can no longer read blocked content.
    expect(await readAsAnonymous('links', blockedLink.id)).toBe(0)
    expect(await readAsAnonymous('posts', blockedPost.id)).toBe(0)
    expect(await readAsAuthor('links', blockedLink.id, user)).toBe(0)
    expect(await readAsAuthor('posts', blockedPost.id, user)).toBe(0)
  })
})
