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
 * Creates or reconciles the authored discovery scenarios.
 *
 * Discoveries are a moderation-owned ledger (`create` requires a site reviewer
 * role), so this seeder writes them with `overrideAccess: true` while still
 * attributing each row to its manifest persona. Vote hooks may also create
 * extra discoveries opportunistically; those are left untouched.
 */
export async function seedDiscoveries(
  payload: Payload,
  users: SeedUsers,
  content: SeededContentIndex,
  referenceNow: Date,
): Promise<SeedStepTally> {
  const tally = createSeedTally('discoveries')
  const scenarios = SEED_INTERACTION_SCENARIOS.filter((scenario) => scenario.kind === 'discovery')

  for (const scenario of scenarios) {
    const actor = requirePersona(users, scenario.actor)
    const target = content.get(scenario.target)

    if (!target || target.kind !== 'post') {
      throw new Error(
        `Seed discovery "${scenario.key}" must target a post scenario; got "${scenario.target}".`,
      )
    }

    const discoveredAt = offsetIsoFromReference(referenceNow, scenario.referenceNowOffsetHours)
    const engagementGenerated = scenario.engagementGenerated ?? 0
    const { docs } = await payload.find({
      collection: 'discoveries',
      where: {
        and: [{ user: { equals: actor.id } }, { post: { equals: target.id } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const existing = docs[0]

    if (existing) {
      const needsUpdate =
        existing.engagementGenerated !== engagementGenerated ||
        new Date(existing.discoveredAt).getTime() !== new Date(discoveredAt).getTime()

      if (needsUpdate) {
        await payload.update({
          collection: 'discoveries',
          id: existing.id,
          data: { discoveredAt, engagementGenerated },
          overrideAccess: true,
          depth: 0,
        })
        tally.reconciled += 1
      } else {
        tally.skipped += 1
      }

      continue
    }

    await payload.create({
      collection: 'discoveries',
      data: {
        user: actor.id,
        post: target.id,
        discoveredAt,
        engagementGenerated,
        createdAt: discoveredAt,
        updatedAt: discoveredAt,
      },
      overrideAccess: true,
      depth: 0,
    })

    tally.created += 1
  }

  return tally
}
