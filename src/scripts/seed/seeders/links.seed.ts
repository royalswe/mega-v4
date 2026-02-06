import type { Payload } from 'payload'
import { faker } from '@faker-js/faker'

export async function seedLinks(payload: Payload) {
  const users = await payload.find({
    collection: 'users',
    limit: 10,
  })

  if (users.docs.length === 0) {
    console.log('No users found. Please create a user first.')
    process.exit(1)
  }

  const types = ['article', 'video', 'image', 'audio', 'game'] as const

  const generateLink = () => ({
    title: faker.word.words({ count: { min: 3, max: 7 } }),
    url: faker.internet.url(),
    description: faker.lorem.sentence(),
    type: types[Math.floor(Math.random() * types.length)],
    user: users.docs[Math.floor(Math.random() * users.docs.length)].id,
    votes: Math.floor(Math.random() * 100),
  })

  // 30 Approved
  for (let i = 0; i < 30; i++) {
    await payload.create({
      collection: 'links',
      data: generateLink(),
      draft: false,
    })
  }

  // 10 Pending
  for (let i = 0; i < 10; i++) {
    await payload.create({
      collection: 'links',
      data: generateLink(),
      draft: true,
    })
  }

  // 5 Rejected
  for (let i = 0; i < 5; i++) {
    await payload.create({
      collection: 'links',
      data: generateLink(),
      draft: true,
    })
  }

  console.log('Seed completed!')
  process.exit(0)
}
