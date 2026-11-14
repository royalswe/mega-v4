import { Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import { getTestPayload } from '../utils/test-user'
import { createFeedItem, createTestLink, createTestUser } from './helpers'
import { toggleContentBookmark } from '@/lib/community/interactions'

/**
 * Bookmark behaviour, not bookmark storage.
 *
 * The previous version created a row and asserted the row echoed back the ids it
 * was given, which only ever proved that Payload persists fields. What can
 * actually regress is the toggle, the XOR constraint, and who is allowed to own
 * the bookmark.
 */

let payload: Payload

describe('Bookmark toggling', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('adds a bookmark, removes it on the next toggle, and restores it on the third', async () => {
    const user = await createTestUser(payload)
    const link = await createTestLink(payload, user.id)

    const on = await toggleContentBookmark({
      payload,
      user,
      targetCollection: 'links',
      targetId: link.id,
    })
    expect(on.bookmarked).toBe(true)

    const onCount = await payload.find({
      collection: 'bookmarks',
      where: { user: { equals: user.id }, link: { equals: link.id } },
      overrideAccess: true,
    })
    expect(onCount.docs).toHaveLength(1)

    const off = await toggleContentBookmark({
      payload,
      user,
      targetCollection: 'links',
      targetId: link.id,
    })
    expect(off.bookmarked).toBe(false)

    const offCount = await payload.find({
      collection: 'bookmarks',
      where: { user: { equals: user.id }, link: { equals: link.id } },
      overrideAccess: true,
    })
    expect(offCount.docs).toHaveLength(0)

    const again = await toggleContentBookmark({
      payload,
      user,
      targetCollection: 'links',
      targetId: link.id,
    })
    expect(again.bookmarked).toBe(true)
  })

  it('toggles Post bookmarks independently of Link bookmarks', async () => {
    const user = await createTestUser(payload)
    const post = await createFeedItem(payload, {
      collection: 'posts',
      user: user.id,
      feed: 'user',
      state: 'published',
    })

    const result = await toggleContentBookmark({
      payload,
      user,
      targetCollection: 'posts',
      targetId: post.id,
    })

    expect(result.bookmarked).toBe(true)
  })

  it('refuses anonymous bookmarks', async () => {
    await expect(
      toggleContentBookmark({
        payload,
        user: null,
        targetCollection: 'links',
        targetId: 1,
      }),
    ).rejects.toThrow(/logged in/i)
  })
})

describe('Bookmark constraints', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('rejects a bookmark that targets nothing', async () => {
    const user = await createTestUser(payload)

    await expect(
      payload.create({
        collection: 'bookmarks',
        data: { user: user.id },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/Either link or post/i)
  })

  it('rejects a bookmark that targets both a Link and a Post', async () => {
    const user = await createTestUser(payload)
    const link = await createTestLink(payload, user.id)
    const post = await createFeedItem(payload, {
      collection: 'posts',
      user: user.id,
      feed: 'user',
      state: 'published',
    })

    await expect(
      payload.create({
        collection: 'bookmarks',
        data: { user: user.id, link: link.id, post: post.id },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/both link and post/i)
  })

  it('forces a member to own the bookmark they create', async () => {
    const owner = await createTestUser(payload)
    const member = await createTestUser(payload)
    const link = await createTestLink(payload, owner.id)

    const created = await payload.create({
      collection: 'bookmarks',
      data: { user: owner.id, link: link.id },
      user: member,
      overrideAccess: false,
    })

    const createdUserId =
      typeof created.user === 'object' ? created.user?.id : (created.user as number)
    expect(createdUserId).toBe(member.id)
  })
})
