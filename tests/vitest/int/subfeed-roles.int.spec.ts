import { Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'
import { faker } from '@faker-js/faker'

import {
  FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE,
  SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE,
  canCurateSubfeedContent,
  canManageSubmittedLinks,
  canModerateCommunity,
  canModerateSubfeedContent,
  canSubmitToSubfeed,
  derivePersistedPublicationState,
  getPublishingDestinationEligibility,
  getSubfeedLocalRoles,
  readRelationshipIds,
  resolveSubfeedOwner,
} from '@/lib/community/subfeeds'
import type { User } from '@/payload-types'
import { getTestPayload, getTestUser } from '../utils/test-user'
import { createRichText, createSubfeedWithRoster, createTestUser } from './helpers'

type LocalRole = 'moderator' | 'editor' | 'uploader'

let payload: Payload

interface SubfeedOpts {
  owner?: number
  moderators?: number[]
  editors?: number[]
  uploaders?: number[]
  members?: number[]
}

const createTestSubfeed = async (ownerId: number, opts: SubfeedOpts = {}) =>
  createSubfeedWithRoster(payload, { ownerId, ...opts, prefix: 'roles' })

const roleDataFor = (role: LocalRole, nextIds: number[], members?: number[]) => ({
  ...(members !== undefined ? { members } : {}),
  ...(role === 'moderator' ? { moderators: nextIds } : {}),
  ...(role === 'editor' ? { editors: nextIds } : {}),
  ...(role === 'uploader' ? { uploaders: nextIds } : {}),
})

const loadSubfeed = async (subfeedId: number | string) =>
  payload.findByID({ collection: 'subfeeds', id: subfeedId, depth: 0, overrideAccess: true })

const assignLocalRole = async (
  subfeedId: number | string,
  actor: User,
  targetId: number,
  role: LocalRole,
) => {
  const current = await loadSubfeed(subfeedId)
  const field =
    role === 'moderator'
      ? current.moderators
      : role === 'editor'
        ? current.editors
        : current.uploaders
  const nextIds = Array.from(new Set([...readRelationshipIds(field), targetId]))
  const nextMembers = Array.from(new Set([...readRelationshipIds(current.members), targetId]))

  return payload.update({
    collection: 'subfeeds',
    id: subfeedId,
    data: roleDataFor(role, nextIds, nextMembers),
    user: actor,
    overrideAccess: false,
    depth: 0,
  })
}

const revokeLocalRole = async (
  subfeedId: number | string,
  actor: User,
  targetId: number,
  role: LocalRole,
) => {
  const current = await loadSubfeed(subfeedId)
  const field =
    role === 'moderator'
      ? current.moderators
      : role === 'editor'
        ? current.editors
        : current.uploaders
  const nextIds = readRelationshipIds(field).filter((id) => id !== targetId)

  return payload.update({
    collection: 'subfeeds',
    id: subfeedId,
    data: roleDataFor(role, nextIds),
    user: actor,
    overrideAccess: false,
    depth: 0,
  })
}

const createSubfeedLink = async (author: User, subfeedId: number, titlePrefix = 'Roles') => {
  const unique = faker.string.alphanumeric(10).toLowerCase()
  return payload.create({
    collection: 'links',
    data: {
      title: `${titlePrefix} Link ${unique}`,
      url: `https://example.com/${unique}`,
      type: 'article',
      user: author.id,
      feed: 'subfeed',
      subfeed: subfeedId,
      _status: 'published',
    },
    draft: false,
    user: author,
    overrideAccess: false,
  })
}

const createSubfeedPost = async (author: User, subfeedId: number, titlePrefix = 'Roles') => {
  const unique = faker.string.alphanumeric(10).toLowerCase()
  return payload.create({
    collection: 'posts',
    data: {
      title: `${titlePrefix} Post ${unique}`,
      content: createRichText(faker.lorem.sentence()),
      type: 'discussion',
      user: author.id,
      feed: 'subfeed',
      subfeed: subfeedId,
    },
    draft: false,
    user: author,
    overrideAccess: false,
  })
}

describe('SubFeed local roles (pure helpers)', () => {
  it('resolves the owner with explicit owner field', () => {
    expect(resolveSubfeedOwner({ owner: 3, moderators: [7, 8] })).toBe(3)
  })

  it('falls back to the first moderator for legacy rows', () => {
    expect(resolveSubfeedOwner({ moderators: [7, 8] })).toBe(7)
    expect(resolveSubfeedOwner({ moderators: [] })).toBe(null)
    expect(resolveSubfeedOwner({})).toBe(null)
  })

  it('derives local roles across the roster', () => {
    const subfeed = {
      owner: 1,
      moderators: [1, 2],
      editors: [3],
      uploaders: [4],
      members: [1, 2, 3, 4, 5],
    }

    expect(getSubfeedLocalRoles(subfeed, 1)).toEqual({
      owner: true,
      moderator: true,
      editor: false,
      uploader: false,
      member: true,
    })
    expect(getSubfeedLocalRoles(subfeed, 2).moderator).toBe(true)
    expect(getSubfeedLocalRoles(subfeed, 3).editor).toBe(true)
    expect(getSubfeedLocalRoles(subfeed, 4).uploader).toBe(true)
    expect(getSubfeedLocalRoles(subfeed, 5)).toEqual({
      owner: false,
      moderator: false,
      editor: false,
      uploader: false,
      member: true,
    })
  })

  it('allows local publishing roles to submit, but not plain members or outsiders', () => {
    const subfeed = { owner: 1, moderators: [1], editors: [3], uploaders: [4], members: [5] }
    expect(canSubmitToSubfeed(subfeed, 5)).toBe(false)
    expect(canSubmitToSubfeed(subfeed, 3)).toBe(true)
    expect(canSubmitToSubfeed(subfeed, 4)).toBe(true)
    expect(canSubmitToSubfeed(subfeed, 1)).toBe(true)
    expect(canSubmitToSubfeed(subfeed, 99)).toBe(false)
  })

  it('scopes moderation to owner/local moderator and curation to editor', () => {
    const subfeed = { owner: 1, moderators: [1, 2], editors: [3], uploaders: [4], members: [5] }
    expect(canModerateSubfeedContent(subfeed, 1)).toBe(true)
    expect(canModerateSubfeedContent(subfeed, 2)).toBe(true)
    expect(canModerateSubfeedContent(subfeed, 3)).toBe(false)
    expect(canModerateSubfeedContent(subfeed, 5)).toBe(false)

    expect(canCurateSubfeedContent(subfeed, 3)).toBe(true)
    expect(canCurateSubfeedContent(subfeed, 5)).toBe(false)
  })

  it('keeps site gates separate from local roles', () => {
    const localOnlyUser = { roles: ['user'] }
    expect(canModerateCommunity(localOnlyUser)).toBe(false)
    expect(canManageSubmittedLinks(localOnlyUser)).toBe(false)

    const siteModerator = { roles: ['user', 'moderator'] }
    expect(canModerateCommunity(siteModerator)).toBe(true)
    expect(canManageSubmittedLinks(siteModerator)).toBe(true)
  })

  it('defaults every member to their User Feed and hides SubFeeds without a role', () => {
    const subfeeds = [
      {
        id: 10,
        name: 'Joined Only',
        slug: 'joined-only',
        owner: 1,
        moderators: [1],
        members: [1, 5],
      },
      {
        id: 11,
        name: 'Uploader Here',
        slug: 'uploader-here',
        moderators: [1],
        uploaders: [5],
        members: [1],
      },
    ]

    const plainMember = getPublishingDestinationEligibility({ id: 5, roles: ['user'] }, subfeeds)
    expect(plainMember.defaultFeed).toBe('user')
    expect(plainMember.canPublishToMain).toBe(false)
    expect(plainMember.eligibleSubfeeds.map((subfeed) => subfeed.id)).toEqual([11])
    expect(plainMember.allowedFeeds).toEqual(['user', 'subfeed'])
    expect(plainMember.hasMultipleDestinations).toBe(true)

    const newcomer = getPublishingDestinationEligibility({ id: 99, roles: ['user'] }, subfeeds)
    expect(newcomer.allowedFeeds).toEqual(['user'])
    expect(newcomer.eligibleSubfeeds).toEqual([])
    expect(newcomer.hasMultipleDestinations).toBe(false)
  })

  it('grants site publishers the Main Feed and every SubFeed', () => {
    const subfeeds = [{ id: 10, name: 'Anything', slug: 'anything', moderators: [1], members: [1] }]

    const editor = getPublishingDestinationEligibility(
      { id: 7, roles: ['user', 'editor'] },
      subfeeds,
    )
    expect(editor.canPublishToMain).toBe(true)
    expect(editor.eligibleSubfeeds.map((subfeed) => subfeed.id)).toEqual([10])
    expect(editor.allowedFeeds).toEqual(['user', 'subfeed', 'main'])

    const uploader = getPublishingDestinationEligibility(
      { id: 8, roles: ['user', 'uploader'] },
      subfeeds,
    )
    expect(uploader.canPublishToMain).toBe(true)

    const localModerator = getPublishingDestinationEligibility({ id: 9, roles: ['user'] }, [
      { id: 12, name: 'Local', slug: 'local', moderators: [9], members: [9] },
    ])
    expect(localModerator.canPublishToMain).toBe(false)
    expect(localModerator.allowedFeeds).toEqual(['user', 'subfeed'])
  })

  it('derives publication state from the persisted document', () => {
    expect(derivePersistedPublicationState('link', { _status: 'published' })).toBe('published')
    expect(derivePersistedPublicationState('link', { _status: 'draft' })).toBe('pending')
    expect(
      derivePersistedPublicationState('link', { _status: 'published', softDeleted: true }),
    ).toBe('blocked')
    expect(
      derivePersistedPublicationState('link', { _status: 'published', quarantined: true }),
    ).toBe('blocked')

    expect(derivePersistedPublicationState('post', { status: 'published' })).toBe('published')
    expect(derivePersistedPublicationState('post', { status: 'pending' })).toBe('pending')
    expect(derivePersistedPublicationState('post', { status: 'removed' })).toBe('blocked')
    expect(
      derivePersistedPublicationState('post', { status: 'published', quarantined: true }),
    ).toBe('blocked')
  })
})

describe('Publishing destination eligibility (unit)', () => {
  const subfeed = (
    id: number,
    overrides: Partial<{
      owner: number
      moderators: number[]
      editors: number[]
      uploaders: number[]
      members: number[]
    }> = {},
  ) => ({
    id,
    name: `Eligibility SubFeed ${id}`,
    slug: `eligibility-subfeed-${id}`,
    owner: overrides.owner ?? 900,
    moderators: overrides.moderators ?? [900],
    editors: overrides.editors ?? [],
    uploaders: overrides.uploaders ?? [],
    members: overrides.members ?? [900],
  })

  it('gives a newcomer with no SubFeeds only their User Feed', () => {
    const eligibility = getPublishingDestinationEligibility({ id: 1, roles: ['user'] }, [])

    expect(eligibility.defaultFeed).toBe('user')
    expect(eligibility.allowedFeeds).toEqual(['user'])
    expect(eligibility.eligibleSubfeeds).toEqual([])
    expect(eligibility.canPublishToMain).toBe(false)
    expect(eligibility.hasMultipleDestinations).toBe(false)
  })

  it('keeps a plain member of multiple SubFeeds on their User Feed only', () => {
    const eligibility = getPublishingDestinationEligibility({ id: 2, roles: ['user'] }, [
      subfeed(10, { members: [900, 2] }),
      subfeed(11, { members: [900, 2] }),
    ])

    expect(eligibility.defaultFeed).toBe('user')
    expect(eligibility.allowedFeeds).toEqual(['user'])
    expect(eligibility.eligibleSubfeeds).toEqual([])
    expect(eligibility.canPublishToMain).toBe(false)
    expect(eligibility.hasMultipleDestinations).toBe(false)
  })

  it('offers only the SubFeeds where the member holds a local publishing role', () => {
    const eligibility = getPublishingDestinationEligibility({ id: 3, roles: ['user'] }, [
      subfeed(20, { uploaders: [3], members: [900, 3] }),
      subfeed(21, { members: [900, 3] }),
    ])

    expect(eligibility.defaultFeed).toBe('user')
    expect(eligibility.allowedFeeds).toEqual(['user', 'subfeed'])
    expect(eligibility.eligibleSubfeeds.map((option) => option.id)).toEqual([20])
    expect(eligibility.canPublishToMain).toBe(false)
    expect(eligibility.hasMultipleDestinations).toBe(true)
  })

  it('includes the Main Feed for site editors and uploaders', () => {
    for (const role of ['editor', 'uploader'] as const) {
      const eligibility = getPublishingDestinationEligibility({ id: 4, roles: ['user', role] }, [])

      expect(eligibility.defaultFeed).toBe('user')
      expect(eligibility.canPublishToMain).toBe(true)
      expect(eligibility.allowedFeeds).toContain('main')
      expect(eligibility.hasMultipleDestinations).toBe(true)
    }
  })
})

describe('SubFeed local roles (integration)', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('protects the owner, including the legacy first-moderator fallback', async () => {
    const owner = await createTestUser(payload)
    const localMod = await createTestUser(payload)
    const subfeed = await createTestSubfeed(owner.id, {
      moderators: [owner.id, localMod.id],
    })
    for (const data of [{ owner: localMod.id }, { moderators: [localMod.id] }]) {
      await expect(
        payload.update({
          collection: 'subfeeds',
          id: subfeed.id,
          data,
          user: localMod,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    }

    await payload.update({
      collection: 'subfeeds',
      id: subfeed.id,
      data: { owner: null },
      overrideAccess: true,
    })
    await expect(revokeLocalRole(subfeed.id, localMod, owner.id, 'moderator')).rejects.toThrow()

    const admin = await payload.update({
      collection: 'users',
      id: localMod.id,
      data: { roles: ['admin', 'user'] },
      overrideAccess: true,
    })
    const transferred = await payload.update({
      collection: 'subfeeds',
      id: subfeed.id,
      data: { owner: localMod.id, moderators: [localMod.id] },
      user: admin,
      overrideAccess: false,
      depth: 0,
    })
    expect(transferred.owner).toBe(localMod.id)
  })

  it('forces a non-site-moderator creator to own their subfeed', async () => {
    const creator = await createTestUser(payload)
    const other = await createTestUser(payload)
    const qualified = await payload.update({
      collection: 'users',
      id: creator.id,
      data: { contributionScore: 200 },
      overrideAccess: true,
    })
    const unique = faker.string.alphanumeric(10).toLowerCase()
    const subfeed = await payload.create({
      collection: 'subfeeds',
      data: {
        name: `Creator ${unique}`,
        slug: `creator-${unique}`,
        description: 'Owner must be the qualified creator',
        owner: other.id,
        moderators: [other.id],
      },
      user: qualified,
      overrideAccess: false,
      depth: 0,
    })
    expect(subfeed.owner).toBe(creator.id)
    expect(subfeed.moderators).toContain(creator.id)
  })

  it('rewards self-joins but not role assignments or roster additions', async () => {
    const owner = await createTestUser(payload)
    const member = await createTestUser(payload)
    const subfeed = await createTestSubfeed(owner.id)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await assignLocalRole(subfeed.id, owner, member.id, 'editor')
      await payload.update({
        collection: 'subfeeds',
        id: subfeed.id,
        data: { editors: [], members: [owner.id] },
        user: owner,
        overrideAccess: false,
      })
    }
    const unchanged = await payload.findByID({
      collection: 'users',
      id: owner.id,
      overrideAccess: true,
    })
    expect(unchanged.recruiterScore).toBe(0)

    await payload.update({
      collection: 'subfeeds',
      id: subfeed.id,
      data: { members: [owner.id, member.id] },
      user: member,
      overrideAccess: false,
    })
    const joined = await payload.findByID({
      collection: 'users',
      id: member.id,
      overrideAccess: true,
    })
    expect(joined.recruiterScore).toBe(1)
  })

  it.each(['links', 'posts'] as const)(
    'lets local editors curate %s but only moderators may retarget another author',
    async (collection) => {
      const owner = await createTestUser(payload)
      const editor = await createTestUser(payload)
      const author = await createTestUser(payload)
      const subfeed = await createTestSubfeed(owner.id, {
        editors: [editor.id],
        uploaders: [author.id],
        members: [owner.id, editor.id, author.id],
      })
      const destination = await createTestSubfeed(owner.id, {
        uploaders: [author.id],
        members: [owner.id, author.id],
      })
      const item =
        collection === 'links'
          ? await createSubfeedLink(author, subfeed.id)
          : await createSubfeedPost(author, subfeed.id)

      for (const data of [
        { feed: 'user' as const, subfeed: null },
        { subfeed: destination.id },
        { user: editor.id },
      ]) {
        await expect(
          payload.update({
            collection,
            id: item.id,
            data,
            user: editor,
            overrideAccess: false,
          }),
        ).rejects.toThrow('Only moderators can change')
      }

      const curated = await payload.update({
        collection,
        id: item.id,
        data: { title: `Curated ${faker.string.alphanumeric(10)}` },
        user: editor,
        overrideAccess: false,
      })
      expect(curated.id).toBe(item.id)

      const moved = await payload.update({
        collection,
        id: item.id,
        data: { subfeed: destination.id },
        user: owner,
        overrideAccess: false,
        depth: 0,
      })
      expect(moved.subfeed).toBe(destination.id)

      const retargeted = await payload.update({
        collection,
        id: item.id,
        data: { feed: 'user', subfeed: null, user: owner.id },
        user: owner,
        overrideAccess: false,
        depth: 0,
      })
      expect(retargeted.feed).toBe('user')
      expect(retargeted.subfeed).toBeNull()
      expect(retargeted.user).toBe(owner.id)
    },
  )

  it.each(['links', 'posts'] as const)(
    'rejects moving %s to a subfeed where its author has no publishing role',
    async (collection) => {
      const owner = await createTestUser(payload)
      const author = await createTestUser(payload)
      const source = await createTestSubfeed(owner.id, {
        uploaders: [author.id],
        members: [owner.id, author.id],
      })
      const destination = await createTestSubfeed(owner.id)
      const item =
        collection === 'links'
          ? await createSubfeedLink(author, source.id)
          : await createSubfeedPost(author, source.id)
      await expect(
        payload.update({
          collection,
          id: item.id,
          data: { subfeed: destination.id },
          user: owner,
          overrideAccess: false,
        }),
      ).rejects.toThrow(SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE)
    },
  )

  it('lets the owner assign and revoke each local role', async () => {
    const owner = await getTestUser()
    const member = await createTestUser(payload)
    const subfeed = await createTestSubfeed(owner.id, { members: [owner.id, member.id] })

    for (const role of ['moderator', 'editor', 'uploader'] as LocalRole[]) {
      const updated = await assignLocalRole(subfeed.id, owner, member.id, role)
      const field =
        role === 'moderator'
          ? updated.moderators
          : role === 'editor'
            ? updated.editors
            : updated.uploaders
      expect(readRelationshipIds(field)).toContain(member.id)
      expect(readRelationshipIds(updated.members)).toContain(member.id)
    }

    // Revoke each role; membership is preserved.
    for (const role of ['uploader', 'editor', 'moderator'] as LocalRole[]) {
      const updated = await revokeLocalRole(subfeed.id, owner, member.id, role)
      const field =
        role === 'moderator'
          ? updated.moderators
          : role === 'editor'
            ? updated.editors
            : updated.uploaders
      expect(readRelationshipIds(field)).not.toContain(member.id)
    }
  })

  it('lets a local moderator assign roles, but not a plain member or an outsider', async () => {
    const owner = await getTestUser()
    const localMod = await createTestUser(payload)
    const plainMember = await createTestUser(payload)
    const target = await createTestUser(payload)

    const subfeed = await createTestSubfeed(owner.id, {
      moderators: [owner.id, localMod.id],
      members: [owner.id, localMod.id, plainMember.id],
    })

    // Local moderator can assign.
    const updated = await assignLocalRole(subfeed.id, localMod, target.id, 'editor')
    expect(readRelationshipIds(updated.editors)).toContain(target.id)
    expect(readRelationshipIds(updated.members)).toContain(target.id)

    // Plain member cannot assign a role.
    await expect(assignLocalRole(subfeed.id, plainMember, target.id, 'uploader')).rejects.toThrow()

    // Outsider cannot assign a role.
    const outsider = await createTestUser(payload)
    await expect(assignLocalRole(subfeed.id, outsider, target.id, 'moderator')).rejects.toThrow()
  })

  it('allows assigned uploader and editor to post links and posts', async () => {
    const owner = await getTestUser()
    const uploader = await createTestUser(payload)
    const editor = await createTestUser(payload)

    const subfeed = await createTestSubfeed(owner.id, {
      editors: [editor.id],
      uploaders: [uploader.id],
      members: [owner.id, uploader.id, editor.id],
    })

    const link = await createSubfeedLink(uploader, subfeed.id, 'Uploader')
    expect(link.feed).toBe('subfeed')

    const post = await createSubfeedPost(editor, subfeed.id, 'Editor')
    expect(post.feed).toBe('subfeed')
    expect(post.status).toBe('published')
  })

  it('lets a local moderator update and delete content; editor updates but cannot delete', async () => {
    const owner = await getTestUser()
    const localMod = await createTestUser(payload)
    const editor = await createTestUser(payload)
    const author = await createTestUser(payload)

    const subfeed = await createTestSubfeed(owner.id, {
      moderators: [owner.id, localMod.id],
      editors: [editor.id],
      uploaders: [author.id],
      members: [owner.id, localMod.id, editor.id, author.id],
    })

    // Author publishes two links: one moderated, one curated.
    const modLink = await createSubfeedLink(author, subfeed.id, 'Mod')
    const editLink = await createSubfeedLink(author, subfeed.id, 'Edit')

    // Local moderator updates the author's link.
    const moderated = await payload.update({
      collection: 'links',
      id: modLink.id,
      data: { description: 'Moderated by a local moderator' },
      user: localMod,
      overrideAccess: false,
    })
    expect(moderated.description).toBe('Moderated by a local moderator')

    // Local editor updates the author's link.
    const curated = await payload.update({
      collection: 'links',
      id: editLink.id,
      data: { description: 'Curated by a local editor' },
      user: editor,
      overrideAccess: false,
    })
    expect(curated.description).toBe('Curated by a local editor')

    // Local editor cannot delete.
    await expect(
      payload.delete({ collection: 'links', id: editLink.id, user: editor, overrideAccess: false }),
    ).rejects.toThrow()

    // Local moderator can delete.
    await payload.delete({
      collection: 'links',
      id: modLink.id,
      user: localMod,
      overrideAccess: false,
    })
    await expect(
      payload.findByID({ collection: 'links', id: modLink.id, overrideAccess: true }),
    ).rejects.toThrow()
  })

  it('lets a local moderator update and delete posts; editor updates but cannot delete', async () => {
    const owner = await getTestUser()
    const localMod = await createTestUser(payload)
    const editor = await createTestUser(payload)
    const author = await createTestUser(payload)

    const subfeed = await createTestSubfeed(owner.id, {
      moderators: [owner.id, localMod.id],
      editors: [editor.id],
      uploaders: [author.id],
      members: [owner.id, localMod.id, editor.id, author.id],
    })

    const modPost = await createSubfeedPost(author, subfeed.id, 'ModPost')
    const editPost = await createSubfeedPost(author, subfeed.id, 'EditPost')

    const moderated = await payload.update({
      collection: 'posts',
      id: modPost.id,
      data: { title: `Moderated ${faker.string.alphanumeric(6).toLowerCase()}` },
      user: localMod,
      overrideAccess: false,
    })
    expect(moderated.id).toBe(modPost.id)

    const curated = await payload.update({
      collection: 'posts',
      id: editPost.id,
      data: { title: `Curated ${faker.string.alphanumeric(6).toLowerCase()}` },
      user: editor,
      overrideAccess: false,
    })
    expect(curated.id).toBe(editPost.id)

    await expect(
      payload.delete({ collection: 'posts', id: editPost.id, user: editor, overrideAccess: false }),
    ).rejects.toThrow()

    await payload.delete({
      collection: 'posts',
      id: modPost.id,
      user: localMod,
      overrideAccess: false,
    })
  })

  it('prevents a plain member from moderating others content', async () => {
    const owner = await getTestUser()
    const author = await createTestUser(payload)
    const plainMember = await createTestUser(payload)

    const subfeed = await createTestSubfeed(owner.id, {
      uploaders: [author.id],
      members: [owner.id, author.id, plainMember.id],
    })

    const link = await createSubfeedLink(author, subfeed.id, 'Plain')

    await expect(
      payload.update({
        collection: 'links',
        id: link.id,
        data: { description: 'Unauthorized edit' },
        user: plainMember,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('isolates local roles across subfeeds', async () => {
    const ownerA = await getTestUser()
    const ownerB = await createTestUser(payload)
    const localModA = await createTestUser(payload)
    const authorB = await createTestUser(payload)

    const subfeedA = await createTestSubfeed(ownerA.id, {
      moderators: [ownerA.id, localModA.id],
      members: [ownerA.id, localModA.id],
    })
    const subfeedB = await createTestSubfeed(ownerB.id, {
      uploaders: [authorB.id],
      members: [ownerB.id, authorB.id],
    })

    const linkB = await createSubfeedLink(authorB, subfeedB.id, 'Other')

    // Local moderator of A cannot update content in B.
    await expect(
      payload.update({
        collection: 'links',
        id: linkB.id,
        data: { description: 'Cross-subfeed edit' },
        user: localModA,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    // Local moderator of A cannot delete content in B.
    await expect(
      payload.delete({ collection: 'links', id: linkB.id, user: localModA, overrideAccess: false }),
    ).rejects.toThrow()

    // Local moderator of A cannot update subfeed B (roster or profile).
    await expect(
      payload.update({
        collection: 'subfeeds',
        id: subfeedB.id,
        data: { description: 'Hijack' },
        user: localModA,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    // Local moderator of A cannot delete subfeed B (nor any subfeed).
    await expect(
      payload.delete({
        collection: 'subfeeds',
        id: subfeedB.id,
        user: localModA,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    // Local moderator of A gains no site roles.
    const refreshed = await payload.findByID({
      collection: 'users',
      id: localModA.id,
      overrideAccess: true,
    })
    expect(refreshed.roles ?? []).not.toContain('moderator')
    expect(refreshed.roles ?? []).not.toContain('editor')
    expect(canManageSubmittedLinks(refreshed)).toBe(false)
    expect(canModerateCommunity(refreshed)).toBe(false)
  })

  it('treats the first moderator as owner for legacy subfeeds', async () => {
    const owner = await getTestUser()
    const legacyOwner = await createTestUser(payload)
    const unique = faker.string.alphanumeric(8).toLowerCase()

    const legacy = await payload.create({
      collection: 'subfeeds',
      data: {
        name: `Legacy SubFeed ${unique}`,
        slug: `legacy-subfeed-${unique}`,
        description: `Legacy subfeed without owner ${unique}`,
        moderators: [legacyOwner.id],
        members: [legacyOwner.id],
      },
      overrideAccess: true,
    })

    // owner field is unset; the first moderator acts as owner.
    const loaded = await loadSubfeed(legacy.id)
    expect(resolveSubfeedOwner(loaded)).toBe(legacyOwner.id)

    // First moderator can manage the subfeed (update its description).
    const updated = await payload.update({
      collection: 'subfeeds',
      id: legacy.id,
      data: { description: `Legacy updated ${unique}` },
      user: legacyOwner,
      overrideAccess: false,
      depth: 0,
    })
    expect(updated.description).toBe(`Legacy updated ${unique}`)
  })

  it.each(['links', 'posts'] as const)(
    'prevents a local moderator from reassigning %s to a third-party author',
    async (collection) => {
      const owner = await createTestUser(payload)
      const localMod = await createTestUser(payload)
      const author = await createTestUser(payload)
      const thirdParty = await createTestUser(payload)

      const subfeed = await createTestSubfeed(owner.id, {
        moderators: [owner.id, localMod.id],
        uploaders: [author.id],
        members: [owner.id, localMod.id, author.id],
      })

      const item =
        collection === 'links'
          ? await createSubfeedLink(author, subfeed.id, 'Reassign')
          : await createSubfeedPost(author, subfeed.id, 'Reassign')

      await expect(
        payload.update({
          collection,
          id: item.id,
          data: { user: thirdParty.id },
          user: localMod,
          overrideAccess: false,
        }),
      ).rejects.toThrow(FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE)

      const reloaded = await payload.findByID({
        collection,
        id: item.id,
        depth: 0,
        overrideAccess: true,
      })
      expect(reloaded.user).toBe(author.id)
    },
  )

  it.each(['links', 'posts'] as const)(
    'allows in-place %s updates after the author loses their local publishing role',
    async (collection) => {
      const owner = await createTestUser(payload)
      const author = await createTestUser(payload)

      const subfeed = await createTestSubfeed(owner.id, {
        uploaders: [author.id],
        members: [owner.id, author.id],
      })

      const item =
        collection === 'links'
          ? await createSubfeedLink(author, subfeed.id, 'Revoked')
          : await createSubfeedPost(author, subfeed.id, 'Revoked')

      await payload.update({
        collection: 'subfeeds',
        id: subfeed.id,
        data: { uploaders: [], members: [owner.id] },
        overrideAccess: true,
      })

      const updated = await payload.update({
        collection,
        id: item.id,
        data: { nsfw: true },
        user: author,
        overrideAccess: false,
      })
      expect(updated.nsfw).toBe(true)
    },
  )
})
