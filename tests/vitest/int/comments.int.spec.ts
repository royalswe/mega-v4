import { Payload } from 'payload'
import { getTestPayload, getTestUser } from '../utils/test-user'
import { describe, it, beforeAll, expect } from 'vitest'
import { faker } from '@faker-js/faker'

let payload: Payload
let testUser: any

describe('Comments Integration', () => {
  beforeAll(async () => {
    payload = await getTestPayload()

    // Get Shared User
    testUser = await getTestUser()
  })

  it('can create a comment on a link', async () => {
    const title = faker.lorem.words(4)
    const url = faker.internet.url()
    const commentText = faker.lorem.words(4)
    const commentJson = {
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: commentText,
                type: 'text',
                version: 1,
              },
            ],
            direction: 'ltr' as const,
            format: '' as const,
            indent: 0,
            type: 'paragraph',
            version: 1,
          },
        ],
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0,
        type: 'root',
        version: 1,
      },
    }

    // 2. Create Link
    const link = await payload.create({
      collection: 'links',
      data: {
        title: title,
        url: url,
        type: 'article',
        user: testUser.id,
        _status: 'published',
      },
      draft: false,
    })

    // 3. Create Comment
    const comment = await payload.create({
      collection: 'comments',
      data: {
        comment: commentJson,
        user: testUser.id,
        link: link.id,
      },
      draft: false,
    })

    expect(comment).toBeDefined()
    expect(comment.comment).toEqual(commentJson)
    expect(comment.user).toEqual(expect.objectContaining({ id: testUser.id }))
    expect(comment.link).toEqual(expect.objectContaining({ id: link.id }))
  })

  it('fails to create comment without required fields', async () => {
    // 2. Try to create comment without link
    await expect(
      // @ts-ignore
      payload.create({
        collection: 'comments',
        data: {
          comment: {
            root: {
              children: [],
              direction: null,
              format: '' as const,
              indent: 0,
              type: 'root',
              version: 1,
            },
          },
          user: testUser.id,
          link: undefined,
        },
        draft: false,
      }),
    ).rejects.toThrow()
  })
})
