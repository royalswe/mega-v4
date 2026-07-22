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
    discoveryScore: number
    contributionScore: number
    interactionScore: number
    moderationScore: number
    legacyContributionScore: number
    securityScore: number
  }> = [
    {
      email: 'admin@mail.com',
      username: 'admin',
      roles: ['admin', 'moderator', 'editor', 'uploader', 'user'],
      language: 'en' as const,
      discoveryScore: 240,
      contributionScore: 320,
      interactionScore: 280,
      moderationScore: 220,
      legacyContributionScore: 900,
      securityScore: 140,
    },
    {
      email: 'moderator@mail.com',
      username: 'moderator',
      roles: ['moderator', 'user'],
      language: 'en' as const,
      discoveryScore: 70,
      contributionScore: 150,
      interactionScore: 90,
      moderationScore: 150,
      legacyContributionScore: 160,
      securityScore: 80,
    },
    {
      email: 'editor@mail.com',
      username: 'editor',
      roles: ['editor', 'user'],
      language: 'en' as const,
      discoveryScore: 90,
      contributionScore: 240,
      interactionScore: 130,
      moderationScore: 20,
      legacyContributionScore: 120,
      securityScore: 45,
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
        discoveryScore: user.discoveryScore,
        contributionScore: user.contributionScore,
        interactionScore: user.interactionScore,
        moderationScore: user.moderationScore,
        legacyContributionScore: user.legacyContributionScore,
        securityScore: user.securityScore,
        lastActiveAt: new Date().toISOString(),
        streakDays: 7,
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
        lastActiveAt: new Date().toISOString(),
        streakDays: faker.number.int({ min: 1, max: 6 }),
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
