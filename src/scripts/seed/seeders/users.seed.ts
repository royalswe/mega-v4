import type { Payload } from 'payload'
import type { User } from '@/payload-types'

import {
  SEED_PERSONAS,
  offsetIsoFromReference,
  resolveReferenceNow,
  type PersonaKey,
  type SeedPersona,
} from './utils.seed'

export type SeedUsers = Map<PersonaKey, User>

const sortedRoles = (roles: readonly string[] | null | undefined): string[] =>
  [...(roles ?? [])].sort()

const assertPersonaStanding = (persona: SeedPersona, doc: User): void => {
  const actualRoles = sortedRoles(doc.roles)
  const expectedRoles = sortedRoles(persona.expectedRoles)

  if (actualRoles.join(',') !== expectedRoles.join(',')) {
    throw new Error(
      [
        `Seed persona "${persona.key}" (${persona.email}) has effective roles [${actualRoles.join(', ')}]`,
        `but the manifest expects [${expectedRoles.join(', ')}].`,
        'syncCommunityProfile in src/collections/Users/index.ts derives automatic roles from signal scores.',
        `Adjust SEED_SCENARIO_MANIFEST.personas["${persona.key}"].scores or expectedRoles instead of bypassing the hook.`,
      ].join(' '),
    )
  }

  if (doc.trustLevel !== persona.expectedTrustLevel) {
    throw new Error(
      [
        `Seed persona "${persona.key}" (${persona.email}) has effective trustLevel "${doc.trustLevel}"`,
        `but the manifest expects "${persona.expectedTrustLevel}".`,
        'Trust level is derived from the weighted signal scores and lastActiveAt;',
        `adjust SEED_SCENARIO_MANIFEST.personas["${persona.key}"].scores or lastActiveOffsetHours.`,
      ].join(' '),
    )
  }
}

/**
 * Upserts the curated persona roster by email and verifies the post-hook
 * effective roles/trust level. Returns the resolved user documents keyed by
 * persona so later seeders can wire SubFeed rosters without re-querying.
 */
export async function seedUsers(
  payload: Payload,
  referenceNow: Date = resolveReferenceNow(),
): Promise<SeedUsers> {
  return upsertPersonas(payload, referenceNow, 'Seeded personas')
}

/**
 * Re-applies the manifest signals after interaction seeding. Vote, comment and
 * discovery hooks call `bumpUserSignals`, so persona standing can otherwise
 * drift away from the manifest. Runs as part of the single post-interaction
 * reconciliation step.
 */
export async function reconcilePersonaStanding(
  payload: Payload,
  referenceNow: Date = resolveReferenceNow(),
): Promise<SeedUsers> {
  return upsertPersonas(payload, referenceNow, 'Reconciled persona standing')
}

const upsertPersonas = async (
  payload: Payload,
  referenceNow: Date,
  logLabel: string,
): Promise<SeedUsers> => {
  const emails = SEED_PERSONAS.map((persona) => persona.email)
  const usernames = SEED_PERSONAS.map((persona) => persona.username)

  const [{ docs: existingByEmail }, { docs: existingByUsername }] = await Promise.all([
    payload.find({
      collection: 'users',
      where: { email: { in: emails } },
      limit: emails.length,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'users',
      where: { username: { in: usernames } },
      limit: usernames.length,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const personaEmails = new Set(emails.map((email) => email.toLowerCase()))

  for (const doc of existingByUsername) {
    if (!personaEmails.has(doc.email.toLowerCase())) {
      throw new Error(
        [
          `Seed persona username collision: "${doc.username}" already belongs to ${doc.email},`,
          'which is not a curated seed persona.',
          'Rename the existing user (or the manifest username) before seeding; the seeder will not overwrite unrelated accounts.',
        ].join(' '),
      )
    }
  }

  const personaByEmail = new Map(
    existingByEmail.map((doc) => [doc.email.toLowerCase(), doc] as const),
  )

  const users: SeedUsers = new Map()
  let created = 0
  let reconciled = 0

  // `syncCommunityProfile` evaluates recency against the real clock. A pinned
  // `SEED_REFERENCE_TIME` controls content recency but must not backdate persona
  // activity, otherwise earned roles decay below the manifest.
  const activityAnchor = new Date(Math.max(referenceNow.getTime(), Date.now()))

  for (const persona of SEED_PERSONAS) {
    const data = {
      email: persona.email,
      username: persona.username,
      password: persona.password,
      bio: persona.bio,
      roles: [...persona.manualRoles],
      discoveryScore: persona.scores.discoveryScore,
      contributionScore: persona.scores.contributionScore,
      interactionScore: persona.scores.interactionScore,
      cleaningScore: persona.scores.cleaningScore,
      moderationScore: persona.scores.moderationScore,
      securityScore: persona.scores.securityScore,
      recruiterScore: persona.scores.recruiterScore,
      likabilityScore: persona.scores.likabilityScore,
      legacyContributionScore: persona.scores.legacyContributionScore,
      streakDays: persona.streakDays,
      lastActiveAt: offsetIsoFromReference(activityAnchor, persona.lastActiveOffsetHours),
      standingLocked: false,
      revokedRoles: [],
      settings: {
        nsfw: false,
        language: persona.language,
      },
    }

    const existing = personaByEmail.get(persona.email.toLowerCase())

    const written = existing
      ? await payload.update({
          collection: 'users',
          id: existing.id,
          data,
          depth: 0,
          overrideAccess: true,
        })
      : await payload.create({
          collection: 'users',
          data,
          depth: 0,
          overrideAccess: true,
        })

    if (existing) reconciled += 1
    else created += 1

    // Re-read so the assertion reflects the persisted document after hooks,
    // not the in-memory write payload.
    const fresh = await payload.findByID({
      collection: 'users',
      id: written.id,
      depth: 0,
      overrideAccess: true,
    })

    assertPersonaStanding(persona, fresh)
    users.set(persona.key, fresh)
  }

  console.log(`${logLabel}: ${created} created, ${reconciled} reconciled (${users.size} total)`)

  return users
}
