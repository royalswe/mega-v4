import type { Payload } from 'payload'

import { pickOne, randomInt, randomRecentDateISO } from './utils.seed'

export async function seedDiscoveries(payload: Payload) {
  const [{ docs: users }, { docs: posts }] = await Promise.all([
    payload.find({
      collection: 'users',
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'posts',
      where: {
        status: {
          equals: 'published',
        },
      },
      limit: 400,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  if (users.length === 0 || posts.length === 0) {
    console.log('Skipping discoveries seed: missing users or posts')
    return
  }

  const seenPairs = new Set<string>()
  let created = 0
  let attempts = 0
  const desired = 90

  while (created < desired && attempts < desired * 5) {
    attempts += 1

    const user = pickOne(users)
    const post = pickOne(posts)
    const key = `${user.id}:${post.id}`

    if (seenPairs.has(key)) {
      continue
    }

    await payload.create({
      collection: 'discoveries',
      data: {
        user: user.id,
        post: post.id,
        discoveredAt: randomRecentDateISO(60),
        engagementGenerated: randomInt(0, 75),
      },
      overrideAccess: true,
    })

    seenPairs.add(key)
    created += 1
  }

  console.log(`Seeded discoveries: ${created}`)
}
