import type { Payload } from 'payload'
import type { Bookmark } from '@/payload-types'

import {
  SEED_INTERACTION_SCENARIOS,
  createSeedTally,
  offsetIsoFromReference,
  readRelationId,
  type SeedStepTally,
  type SeededContentIndex,
} from './utils.seed'
import { requirePersona } from './links.seed'
import type { SeedUsers } from './users.seed'

const bookmarkKey = (userId: number, kind: 'link' | 'post', targetId: number) =>
  `${userId}:${kind}:${targetId}`

/** Creates the authored bookmark scenarios, skipping rows that already exist. */
export async function seedBookmarks(
  payload: Payload,
  users: SeedUsers,
  content: SeededContentIndex,
  referenceNow: Date,
): Promise<SeedStepTally> {
  const tally = createSeedTally('bookmarks')
  const scenarios = SEED_INTERACTION_SCENARIOS.filter((scenario) => scenario.kind === 'bookmark')

  const { docs: existingBookmarks } = await payload.find({
    collection: 'bookmarks',
    limit: 10_000,
    depth: 0,
    overrideAccess: true,
  })

  const seen = new Set<string>()

  for (const bookmark of existingBookmarks) {
    const userId = readRelationId(bookmark.user)
    const targetId = readRelationId(bookmark.link) ?? readRelationId(bookmark.post)
    const kind = bookmark.link ? 'link' : bookmark.post ? 'post' : null

    if (!userId || !targetId || !kind) continue
    seen.add(bookmarkKey(userId, kind, targetId))
  }

  for (const scenario of scenarios) {
    const actor = requirePersona(users, scenario.actor)
    const target = content.get(scenario.target)

    if (!target) {
      throw new Error(
        `Seed bookmark "${scenario.key}" targets unknown content scenario "${scenario.target}".`,
      )
    }

    const key = bookmarkKey(actor.id, target.kind, target.id)

    if (seen.has(key)) {
      tally.skipped += 1
      continue
    }

    const createdAt = offsetIsoFromReference(referenceNow, scenario.referenceNowOffsetHours)
    await payload.create({
      collection: 'bookmarks',
      data: {
        user: actor.id,
        link: target.kind === 'link' ? target.id : undefined,
        post: target.kind === 'post' ? target.id : undefined,
        createdAt,
        updatedAt: createdAt,
      },
      user: actor,
      overrideAccess: false,
      depth: 0,
    })

    seen.add(key)
    tally.created += 1
  }

  return tally
}
