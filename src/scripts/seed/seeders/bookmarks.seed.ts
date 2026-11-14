import type { Payload } from 'payload'

import {
  SEED_INTERACTION_SCENARIOS,
  createSeedTally,
  offsetIsoFromReference,
  type SeedStepTally,
  type SeededContentIndex,
} from './utils.seed'
import { requirePersona } from './links.seed'
import type { SeedUsers } from './users.seed'

/** Creates the authored bookmark scenarios, skipping rows that already exist. */
export async function seedBookmarks(
  payload: Payload,
  users: SeedUsers,
  content: SeededContentIndex,
  referenceNow: Date,
): Promise<SeedStepTally> {
  const tally = createSeedTally('bookmarks')
  const scenarios = SEED_INTERACTION_SCENARIOS.filter((scenario) => scenario.kind === 'bookmark')

  for (const scenario of scenarios) {
    const actor = requirePersona(users, scenario.actor)
    const target = content.get(scenario.target)

    if (!target) {
      throw new Error(
        `Seed bookmark "${scenario.key}" targets unknown content scenario "${scenario.target}".`,
      )
    }

    const { docs: existing } = await payload.find({
      collection: 'bookmarks',
      where: {
        and: [{ user: { equals: actor.id } }, { [target.kind]: { equals: target.id } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (existing.length > 0) {
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

    tally.created += 1
  }

  return tally
}
