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
 * Creates the authored moderation reports. Reports are append-only scenario
 * records, so an existing row is skipped rather than rewritten (rewriting a
 * reporter's account would change the moderation narrative).
 */
export async function seedReports(
  payload: Payload,
  users: SeedUsers,
  content: SeededContentIndex,
  referenceNow: Date,
): Promise<SeedStepTally> {
  const tally = createSeedTally('reports')
  const scenarios = SEED_INTERACTION_SCENARIOS.filter((scenario) => scenario.kind === 'report')

  for (const scenario of scenarios) {
    const actor = requirePersona(users, scenario.actor)
    const target = content.get(scenario.target)

    if (!target) {
      throw new Error(
        `Seed report "${scenario.key}" targets unknown content scenario "${scenario.target}".`,
      )
    }

    if (!scenario.reason) {
      throw new Error(`Seed report "${scenario.key}" has no reason.`)
    }

    const { docs: existing } = await payload.find({
      collection: 'reports',
      where: {
        and: [
          { reporter: { equals: actor.id } },
          { [target.kind === 'link' ? 'targetLink' : 'targetPost']: { equals: target.id } },
          { reason: { equals: scenario.reason } },
        ],
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
      collection: 'reports',
      data: {
        reporter: actor.id,
        targetType: target.kind,
        targetId: String(target.id),
        targetLink: target.kind === 'link' ? target.id : undefined,
        targetPost: target.kind === 'post' ? target.id : undefined,
        reason: scenario.reason,
        details: scenario.details,
        status: 'pending',
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
