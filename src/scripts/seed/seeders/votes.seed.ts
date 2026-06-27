import type { Payload } from 'payload'

import { chance, pickOne } from './utils.seed'

const readRelationId = (value: unknown): number | null => {
  if (typeof value === 'number') return value

  if (value && typeof value === 'object' && 'id' in value) {
    const relation = value as { id?: unknown }
    return typeof relation.id === 'number' ? relation.id : null
  }

  return null
}

type VoteTarget =
  | {
      type: 'link'
      id: number
    }
  | {
      type: 'post'
      id: number
    }

export async function seedVotes(payload: Payload) {
  const [{ docs: users }, { docs: links }, { docs: posts }, { docs: existingVotes }] =
    await Promise.all([
      payload.find({
        collection: 'users',
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'links',
        where: {
          softDeleted: {
            not_equals: true,
          },
        },
        limit: 500,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'posts',
        where: {
          status: {
            not_equals: 'removed',
          },
        },
        limit: 500,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'votes',
        limit: 10_000,
        depth: 0,
        overrideAccess: true,
      }),
    ])

  if (users.length === 0) {
    console.log('Skipping vote seed: no users available')
    return
  }

  const targets: VoteTarget[] = [
    ...links.map((link) => ({ type: 'link' as const, id: link.id })),
    ...posts.map((post) => ({ type: 'post' as const, id: post.id })),
  ]

  if (targets.length === 0) {
    console.log('Skipping vote seed: no targets available')
    return
  }

  const seenVotes = new Set<string>(
    existingVotes
      .map((vote) => {
        const userId = readRelationId(vote.user)
        const linkId = readRelationId(vote.link)
        const postId = readRelationId(vote.post)

        if (!userId) return null
        if (linkId) return `${userId}:link:${linkId}`
        if (postId) return `${userId}:post:${postId}`

        return null
      })
      .filter((item): item is string => Boolean(item)),
  )
  let created = 0
  let attempts = 0
  const desired = 260

  while (created < desired && attempts < desired * 5) {
    attempts += 1

    const user = pickOne(users)
    const target = pickOne(targets)
    const key = `${user.id}:${target.type}:${target.id}`

    if (seenVotes.has(key)) {
      continue
    }

    await payload.create({
      collection: 'votes',
      data: {
        user: user.id,
        link: target.type === 'link' ? target.id : undefined,
        post: target.type === 'post' ? target.id : undefined,
        vote: chance(0.78) ? 'up' : 'down',
      },
      overrideAccess: true,
    })

    seenVotes.add(key)
    created += 1
  }

  console.log(`Seeded votes: ${created}`)
}
