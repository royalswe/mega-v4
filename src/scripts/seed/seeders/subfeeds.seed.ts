import type { Payload } from 'payload'
import type { Subfeed } from '@/payload-types'

import { SEED_SUBFEEDS, type PersonaKey, type SeedSubfeed, type SubfeedKey } from './utils.seed'
import type { SeedUsers } from './users.seed'

export type SeedSubfeeds = Map<SubfeedKey, Subfeed>

const readRelationIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return []

  return value.flatMap((relation) => {
    if (typeof relation === 'number') return [relation]

    if (relation && typeof relation === 'object' && 'id' in relation) {
      const id = (relation as { id?: unknown }).id
      return typeof id === 'number' ? [id] : []
    }

    return []
  })
}

const sortIds = (value: unknown): number[] => readRelationIds(value).sort((a, b) => a - b)

const ownerId = (doc: Pick<Subfeed, 'owner'>): number | null => {
  const value = doc.owner
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof value.id === 'number') return value.id
  return null
}

const sameIds = (actual: number[], expected: number[]): boolean =>
  actual.length === expected.length && actual.every((id, index) => id === expected[index])

interface Roster {
  owner: number | null
  moderators: number[]
  editors: number[]
  uploaders: number[]
  members: number[]
}

const rosterOf = (doc: Subfeed): Roster => ({
  owner: ownerId(doc),
  moderators: sortIds(doc.moderators),
  editors: sortIds(doc.editors),
  uploaders: sortIds(doc.uploaders),
  members: sortIds(doc.members),
})

const describeMismatch = (blueprint: SeedSubfeed, actual: Roster, expected: Roster): string[] => {
  const differences: string[] = []

  if (actual.owner !== expected.owner) {
    differences.push(`owner: expected ${expected.owner ?? 'none'}, got ${actual.owner ?? 'none'}`)
  }

  const rosterFields = ['moderators', 'editors', 'uploaders', 'members'] as const

  for (const field of rosterFields) {
    if (!sameIds(actual[field], expected[field])) {
      differences.push(
        `${field}: expected ${expected[field].join(',') || 'none'}, got ${actual[field].join(',') || 'none'}`,
      )
    }
  }

  return differences.map((difference) => `  ${blueprint.key} -> ${difference}`)
}

const requirePersona = (users: SeedUsers, key: PersonaKey): number => {
  const user = users.get(key)

  if (!user) {
    throw new Error(
      `Seed SubFeeds need persona "${key}", but seedUsers did not return it. Run seedUsers before seedSubfeeds.`,
    )
  }

  return user.id
}

const personaIds = (users: SeedUsers, keys: readonly PersonaKey[]): number[] =>
  keys.map((key) => requirePersona(users, key))

/** Every SubFeed roster slot the persona currently occupies, e.g. `nordic-indie-web:members`. */
const membershipsOf = (
  persona: PersonaKey,
  rosters: Array<{ key: SubfeedKey; roster: Roster }>,
  users: SeedUsers,
): string[] => {
  const id = requirePersona(users, persona)
  const memberships: string[] = []

  for (const { key, roster } of rosters) {
    if (roster.owner === id) memberships.push(`${key}:owner`)
    if (roster.moderators.includes(id)) memberships.push(`${key}:moderators`)
    if (roster.editors.includes(id)) memberships.push(`${key}:editors`)
    if (roster.uploaders.includes(id)) memberships.push(`${key}:uploaders`)
    if (roster.members.includes(id)) memberships.push(`${key}:members`)
  }

  return memberships.sort()
}

const expectedMemberships = (persona: PersonaKey): string[] => {
  const memberships: string[] = []

  for (const blueprint of SEED_SUBFEEDS) {
    if (blueprint.owner === persona) memberships.push(`${blueprint.key}:owner`)
    if (blueprint.moderators.includes(persona)) memberships.push(`${blueprint.key}:moderators`)
    if (blueprint.editors.includes(persona)) memberships.push(`${blueprint.key}:editors`)
    if (blueprint.uploaders.includes(persona)) memberships.push(`${blueprint.key}:uploaders`)
    if (blueprint.members.includes(persona)) memberships.push(`${blueprint.key}:members`)
  }

  return memberships.sort()
}

const assertPersonaMemberships = (
  persona: PersonaKey,
  rosters: Array<{ key: SubfeedKey; roster: Roster }>,
  users: SeedUsers,
): void => {
  const actual = membershipsOf(persona, rosters, users)
  const expected = expectedMemberships(persona)

  if (actual.join('|') !== expected.join('|')) {
    throw new Error(
      [
        `Seed persona "${persona}" has SubFeed memberships [${actual.join(', ') || 'none'}]`,
        `but the manifest expects [${expected.join(', ') || 'none'}].`,
        'Check owner/moderators/editors/uploaders/members in SEED_SCENARIO_MANIFEST.subfeeds.',
      ].join(' '),
    )
  }
}

/**
 * Upserts the curated SubFeeds by slug and wires their rosters from the persona
 * map. Fails loudly if the persisted roster or a persona's cross-SubFeed
 * memberships drift from the manifest.
 */
export async function seedSubfeeds(
  payload: Payload,
  users: SeedUsers,
  referenceNow: Date,
): Promise<SeedSubfeeds> {
  const slugs = SEED_SUBFEEDS.map((blueprint) => blueprint.key)

  const { docs: existingSubfeeds } = await payload.find({
    collection: 'subfeeds',
    where: { slug: { in: [...slugs] } },
    limit: slugs.length,
    depth: 0,
    overrideAccess: true,
  })

  const existingBySlug = new Map(existingSubfeeds.map((doc) => [doc.slug, doc] as const))

  const subfeeds: SeedSubfeeds = new Map()
  const resolved: Array<{ key: SubfeedKey; roster: Roster }> = []
  let created = 0
  let reconciled = 0

  const seededPersonaIds = new Set([...users.values()].map((user) => user.id))

  for (const blueprint of SEED_SUBFEEDS) {
    const data = {
      name: blueprint.name,
      slug: blueprint.key,
      description: blueprint.description,
      rules: blueprint.rules,
      theme: blueprint.theme,
      featured: blueprint.featured,
      owner: requirePersona(users, blueprint.owner),
      moderators: personaIds(users, blueprint.moderators),
      editors: personaIds(users, blueprint.editors),
      uploaders: personaIds(users, blueprint.uploaders),
      members: personaIds(users, blueprint.members),
    }

    const existing = existingBySlug.get(blueprint.key)

    if (existing) {
      const currentOwnerId = ownerId(existing)

      if (!currentOwnerId || !seededPersonaIds.has(currentOwnerId)) {
        throw new Error(
          `Seed SubFeed "${blueprint.key}" already exists with owner ${currentOwnerId ?? 'none'}, which is not a curated seed persona. Refusing to overwrite unrelated content; rename or remove the conflicting SubFeed.`,
        )
      }
    }

    const written = existing
      ? await payload.update({
          collection: 'subfeeds',
          id: existing.id,
          data,
          depth: 0,
          overrideAccess: true,
        })
      : await payload.create({
          collection: 'subfeeds',
          data,
          depth: 0,
          overrideAccess: true,
        })

    if (existing) reconciled += 1
    else created += 1

    const fresh = await payload.findByID({
      collection: 'subfeeds',
      id: written.id,
      depth: 0,
      overrideAccess: true,
    })

    const actualRoster = rosterOf(fresh)
    const expectedRoster: Roster = {
      owner: data.owner,
      moderators: [...data.moderators].sort((a, b) => a - b),
      editors: [...data.editors].sort((a, b) => a - b),
      uploaders: [...data.uploaders].sort((a, b) => a - b),
      members: [...data.members].sort((a, b) => a - b),
    }

    const differences = describeMismatch(blueprint, actualRoster, expectedRoster)

    if (differences.length > 0) {
      throw new Error(
        [
          `Seed SubFeed "${blueprint.key}" did not persist the manifest roster:`,
          ...differences,
        ].join('\n'),
      )
    }

    subfeeds.set(blueprint.key, fresh)
    resolved.push({ key: blueprint.key, roster: actualRoster })
  }

  // Scenario invariants required by Issue #27: a newcomer with zero SubFeeds,
  // a membership-only participant, and a local-uploader-only persona.
  assertPersonaMemberships('astrid', resolved, users)
  assertPersonaMemberships('malin', resolved, users)
  assertPersonaMemberships('linnea', resolved, users)

  console.log(
    `Seeded SubFeeds at reference time ${referenceNow.toISOString()}: ${created} created, ${reconciled} reconciled (${subfeeds.size} total)`,
  )

  return subfeeds
}
