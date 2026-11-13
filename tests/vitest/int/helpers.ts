import { Payload } from 'payload'

import { faker } from '@faker-js/faker'

export const createTestUser = async (payload: Payload) => {
  // Usernames and emails are unique across the whole database, not just this
  // run, so a faker-only value eventually collides against the accumulated test
  // data and fails the suite intermittently.
  const unique = faker.string.alphanumeric(12).toLowerCase()
  const email = `${unique}-${faker.internet.email()}`
  const password = faker.internet.password()
  const username = `${faker.internet.username()}-${unique}`

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
    overrideAccess: true,
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
    overrideAccess: true,
  })
}
