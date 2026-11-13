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

/**
 * Creates or reconciles the deterministic vote scenarios. Vote uniqueness is
 * preserved both by a targeted natural-key lookup and the collection's hook, so a
 * rerun updates a changed direction instead of adding a duplicate vote.
 */
export async function seedVotes(
  payload: Payload,
  users: SeedUsers,
  content: SeededContentIndex,
  referenceNow: Date,
): Promise<SeedStepTally> {
  const tally = createSeedTally('votes')
  const scenarios = SEED_INTERACTION_SCENARIOS.filter((scenario) => scenario.kind === 'vote')

  for (const scenario of scenarios) {
    const actor = requirePersona(users, scenario.actor)
    const target = content.get(scenario.target)

    if (!target) {
      throw new Error(
        `Seed vote "${scenario.key}" targets unknown content scenario "${scenario.target}".`,
      )
    }

    if (!scenario.value) {
      throw new Error(`Seed vote "${scenario.key}" has no direction.`)
    }

    const { docs } = await payload.find({
      collection: 'votes',
      where: {
        and: [{ user: { equals: actor.id } }, { [target.kind]: { equals: target.id } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const existing = docs[0]

    if (existing) {
      if (existing.vote !== scenario.value) {
        await payload.update({
          collection: 'votes',
          id: existing.id,
          data: { vote: scenario.value },
          user: actor,
          overrideAccess: false,
          depth: 0,
        })
        tally.reconciled += 1
      } else {
        tally.skipped += 1
      }

      continue
    }

    const createdAt = offsetIsoFromReference(referenceNow, scenario.referenceNowOffsetHours)
    await payload.create({
      collection: 'votes',
      data: {
        user: actor.id,
        link: target.kind === 'link' ? target.id : undefined,
        post: target.kind === 'post' ? target.id : undefined,
        vote: scenario.value,
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
