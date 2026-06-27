import { Payload } from 'payload'

import { faker } from '@faker-js/faker'

export const createTestUser = async (payload: Payload) => {
  const email = faker.internet.email()
  const password = faker.internet.password()
  const username = faker.internet.username()

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
  const unique = faker.string.alphanumeric(10).toLowerCase()

  return await payload.create({
    collection: 'links',
    data: {
      title: `Integration Test Link ${unique}`,
      url: `https://example.com/${unique}`,
      type: 'article',
      user: userId as number, // Cast to number if that's what Payload expects, or check schema
      _status: 'published',
    },
  })
}
