import type { Payload } from 'payload'
import { faker } from '@faker-js/faker'

export async function seedUsers(payload: Payload) {
  const users = []

  for (let i = 0; i < 10; i++) {
    users.push({
      email: faker.internet.email(),
      password: 'password123',
      username: faker.internet.username(),
    })
  }

  for (const user of users) {
    await payload.create({
      collection: 'users',
      data: user,
      draft: true,
    })
  }

  console.log('Seeded users')
}
