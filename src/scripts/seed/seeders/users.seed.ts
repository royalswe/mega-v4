import type { Payload } from 'payload'
import { faker } from '@faker-js/faker'

export async function seedUsers(payload: Payload) {
  type UserRole = 'admin' | 'editor' | 'moderator' | 'uploader' | 'user'

  const [{ docs: existingUsers }] = await Promise.all([
    payload.find({
      collection: 'users',
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const existingEmails = new Set(existingUsers.map((user) => user.email.toLowerCase()))

  const coreUsers: Array<{
    email: string
    username: string
    roles: UserRole[]
    language: 'en'
  }> = [
    {
      email: 'admin@mail.com',
      username: 'admin',
      roles: ['admin', 'moderator', 'editor', 'uploader', 'user'],
      language: 'en' as const,
    },
    {
      email: 'moderator@mail.com',
      username: 'moderator',
      roles: ['moderator', 'user'],
      language: 'en' as const,
    },
    {
      email: 'editor@mail.com',
      username: 'editor',
      roles: ['editor', 'user'],
      language: 'en' as const,
    },
  ]

  let created = 0

  for (const user of coreUsers) {
    if (existingEmails.has(user.email.toLowerCase())) {
      continue
    }

    await payload.create({
      collection: 'users',
      data: {
        email: user.email,
        username: user.username,
        password: 'password123',
        roles: user.roles,
        settings: {
          nsfw: false,
          language: user.language,
        },
      },
      overrideAccess: true,
    })

    existingEmails.add(user.email.toLowerCase())
    created += 1
  }

  for (let i = 0; i < 14; i += 1) {
    const email = faker.internet.email().toLowerCase()
    if (existingEmails.has(email)) continue

    await payload.create({
      collection: 'users',
      data: {
        email,
        username: faker.internet.username().toLowerCase(),
        password: 'password123',
        settings: {
          nsfw: faker.datatype.boolean({ probability: 0.2 }),
          language: faker.helpers.arrayElement(['en', 'sv']),
        },
      },
      overrideAccess: true,
    })

    existingEmails.add(email)
    created += 1
  }

  console.log(`Seeded users: ${created}`)
}
