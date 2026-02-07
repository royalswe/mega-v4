import { Payload } from 'payload'

export const createTestUser = async (payload: Payload) => {
  const timestamp = Date.now()
  const email = `test-int-${timestamp}@example.com`
  const password = 'password123'
  const username = `testuser-${timestamp}`

  const user = await payload.create({
    collection: 'users',
    data: {
      email,
      username,
      password,
      settings: {
        nsfw: false,
        language: 'en',
      },
    },
    draft: false,
  })

  return user
}

export const createTestLink = async (payload: Payload, userId: number | string) => {
  return await payload.create({
    collection: 'links',
    data: {
      title: 'Integration Test Link',
      url: 'https://example.com',
      type: 'article',
      user: userId as number, // Cast to number if that's what Payload expects, or check schema
      _status: 'published',
    },
  })
}
