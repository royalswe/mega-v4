import type { Payload } from 'payload'

import { pickOne } from './utils.seed'

type BookmarkTarget =
  | {
      type: 'link'
      id: number
    }
  | {
      type: 'post'
      id: number
    }

export async function seedBookmarks(payload: Payload) {
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
        softDeleted: {
          not_equals: true,
        },
      },
      limit: 400,
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
      limit: 400,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  if (users.length === 0) {
    console.log('Skipping bookmark seed: no users available')
    return
  }

  const targets: BookmarkTarget[] = [
    ...links.map((link) => ({ type: 'link' as const, id: link.id })),
    ...posts.map((post) => ({ type: 'post' as const, id: post.id })),
  ]

  if (targets.length === 0) {
    console.log('Skipping bookmark seed: no targets available')
    return
  }

  const existing = new Set<string>()
  let created = 0
  let attempts = 0
  const desired = 180

  while (created < desired && attempts < desired * 5) {
    attempts += 1

    const user = pickOne(users)
    const target = pickOne(targets)
    const key = `${user.id}:${target.type}:${target.id}`

    if (existing.has(key)) {
      continue
    }

    await payload.create({
      collection: 'bookmarks',
      data: {
        user: user.id,
        link: target.type === 'link' ? target.id : undefined,
        post: target.type === 'post' ? target.id : undefined,
      },
      overrideAccess: true,
    })

    existing.add(key)
    created += 1
  }

  console.log(`Seeded bookmarks: ${created}`)
}
