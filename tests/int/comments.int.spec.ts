import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, expect } from 'vitest'

let payload: Payload

describe('Comments Integration', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('can create a comment on a link', async () => {
    // 1. Create User
    const user = await payload.create({
      collection: 'users',
      data: {
        email: `commenter-${Date.now()}@example.com`,
        username: `commenter-${Date.now()}`,
        password: 'password123',
      },
    })

    // 2. Create Link
    const link = await payload.create({
      collection: 'links',
      data: {
        title: 'Link for Commenting',
        url: 'https://example.com',
        type: 'article',
        user: user.id,
        _status: 'published',
      },
    })

    // 3. Create Comment
    const comment = await payload.create({
      collection: 'comments',
      data: {
        comment: 'This is a test comment',
        user: user.id,
        link: link.id,
      },
    })

    expect(comment).toBeDefined()
    expect(comment.comment).toBe('This is a test comment')
    expect(comment.user).toEqual(expect.objectContaining({ id: user.id }))
    expect(comment.link).toEqual(expect.objectContaining({ id: link.id }))
  })

  it('fails to create comment without required fields', async () => {
    // 1. Create User
    const user = await payload.create({
      collection: 'users',
      data: {
        email: `fail-commenter-${Date.now()}@example.com`,
        username: `fail-commenter-${Date.now()}`,
        password: 'password123',
      },
    })

    // 2. Try to create comment without link
    await expect(
      payload.create({
        collection: 'comments',
        data: {
          comment: 'Orphan comment',
          user: user.id,
          // @ts-ignore
          link: undefined,
        },
      }),
    ).rejects.toThrow()
  })
})
