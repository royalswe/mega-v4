import type { Payload } from 'payload'
import { faker } from '@faker-js/faker'

import { asLexicalRichText, chance, pickOne } from './utils.seed'

type Target = {
  id: number
  type: 'link' | 'post'
}

type SeededComment = {
  id: number
  targetKey: string
}

export async function seedComments(payload: Payload) {
  const [{ docs: users }, { docs: links }, { docs: posts }] = await Promise.all([
    payload.find({
      collection: 'users',
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'links',
      where: {
        moderationStatus: {
          not_equals: 'removed',
        },
      },
      limit: 300,
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
      limit: 300,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  if (users.length === 0) {
    console.log('Skipping comment seed: no users available')
    return
  }

  const targets: Target[] = [
    ...links.map((link) => ({ id: link.id, type: 'link' as const })),
    ...posts.map((post) => ({ id: post.id, type: 'post' as const })),
  ]

  if (targets.length === 0) {
    console.log('Skipping comment seed: no links or posts available')
    return
  }

  const seededComments: SeededComment[] = []
  let created = 0

  for (let i = 0; i < 120; i += 1) {
    const author = pickOne(users)
    const target = pickOne(targets)
    const targetKey = `${target.type}:${target.id}`

    const parentCandidates = seededComments.filter((comment) => comment.targetKey === targetKey)
    const parentComment =
      chance(0.2) && parentCandidates.length > 0 ? pickOne(parentCandidates).id : undefined

    const comment = await payload.create({
      collection: 'comments',
      data: {
        user: author.id,
        link: target.type === 'link' ? target.id : undefined,
        post: target.type === 'post' ? target.id : undefined,
        parentComment,
        comment: asLexicalRichText(faker.lorem.sentences({ min: 1, max: 3 })),
        moderationStatus: chance(0.08) ? 'pending' : 'visible',
      },
      overrideAccess: true,
    })

    seededComments.push({
      id: comment.id,
      targetKey,
    })

    created += 1
  }

  console.log(`Seeded comments: ${created}`)
}
