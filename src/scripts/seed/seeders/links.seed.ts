import type { Payload } from 'payload'
import type { Link, User } from '@/payload-types'

import type { SeedSubfeeds } from './subfeeds.seed'
import {
  SEED_CONTENT_SCENARIOS,
  createSeedTally,
  offsetIsoFromReference,
  readRelationId,
  type ContentScenarioKey,
  type PersonaKey,
  type SeedContentScenario,
  type SeedLinkScenario,
  type SeedStepTally,
  type SubfeedKey,
} from './utils.seed'
import type { SeedUsers } from './users.seed'

export interface SeedContentResult {
  tally: SeedStepTally
  ids: Map<string, number>
}

export const requirePersona = (users: SeedUsers, key: PersonaKey): User => {
  const user = users.get(key)

  if (!user) {
    throw new Error(
      `Seed scenario needs persona "${key}", but seedUsers did not return it. Run seedUsers first.`,
    )
  }

  return user
}

export const requireSubfeed = (subfeeds: SeedSubfeeds, key: SubfeedKey) => {
  const subfeed = subfeeds.get(key)

  if (!subfeed) {
    throw new Error(
      `Seed scenario needs SubFeed "${key}", but seedSubfeeds did not return it. Run seedSubfeeds first.`,
    )
  }

  return subfeed
}

const assertLinkScenario = ({
  actual,
  author,
  scenario,
  subfeedId,
}: {
  actual: Link
  author: User
  scenario: SeedLinkScenario
  subfeedId?: number
}) => {
  const problems: string[] = []

  if (actual.slug !== scenario.key)
    problems.push(`slug: expected ${scenario.key}, got ${actual.slug}`)
  if (actual.feed !== scenario.destination.feed) {
    problems.push(`feed: expected ${scenario.destination.feed}, got ${actual.feed}`)
  }
  if (readRelationId(actual.user) !== author.id) {
    problems.push(
      `user: expected ${author.id} (${scenario.author}), got ${readRelationId(actual.user)}`,
    )
  }
  if (readRelationId(actual.subfeed) !== (subfeedId ?? null)) {
    problems.push(`subfeed: expected ${subfeedId ?? 'none'}, got ${readRelationId(actual.subfeed)}`)
  }
  if (actual._status !== 'published') {
    problems.push(`_status: expected published, got ${actual._status}`)
  }

  if (problems.length > 0) {
    throw new Error(
      `Seeded link "${scenario.key}" fell outside its scenario:\n  ${problems.join('\n  ')}`,
    )
  }
}

/**
 * Creates or reconciles the manifest's Link scenarios through the real
 * authorisation path (`user` + `overrideAccess: false`). Moderator/system signal
 * fields are applied later by the single reconciliation pass in `seed.ts`.
 */
export async function seedLinks(
  payload: Payload,
  users: SeedUsers,
  subfeeds: SeedSubfeeds,
  referenceNow: Date,
): Promise<SeedContentResult> {
  const tally = createSeedTally('links')
  const ids = new Map<string, number>()
  const scenarios: SeedLinkScenario[] = []

  for (const scenario of SEED_CONTENT_SCENARIOS as readonly SeedContentScenario[]) {
    if (scenario.kind === 'link') scenarios.push(scenario)
  }

  const slugs = scenarios.map((scenario) => scenario.key)
  const urls = scenarios.map((scenario) => scenario.url)

  const { docs: existingLinks } = await payload.find({
    collection: 'links',
    where: {
      or: [{ slug: { in: slugs } }, { url: { in: urls } }],
    },
    limit: slugs.length * 2,
    depth: 0,
    overrideAccess: true,
  })

  const existingBySlug = new Map<string, (typeof existingLinks)[number]>()
  const existingByUrl = new Map<string, (typeof existingLinks)[number]>()

  for (const link of existingLinks) {
    if (link.slug) existingBySlug.set(link.slug, link)
    existingByUrl.set(link.url, link)
  }

  for (const scenario of scenarios) {
    const author = requirePersona(users, scenario.author)
    const subfeed =
      scenario.destination.feed === 'subfeed'
        ? requireSubfeed(subfeeds, scenario.destination.subfeed)
        : null

    const data = {
      title: scenario.title,
      slug: scenario.key,
      url: scenario.url,
      description: scenario.description,
      type: scenario.type,
      user: author.id,
      feed: scenario.destination.feed,
      subfeed: subfeed?.id,
      tags: [...scenario.tags],
      nsfw: false,
    }

    const existing = existingBySlug.get(scenario.key) ?? existingByUrl.get(scenario.url)

    if (existing && existing.slug !== scenario.key) {
      throw new Error(
        `Seed link URL "${scenario.url}" already exists under slug "${existing.slug}", but the manifest expects slug "${scenario.key}". Refusing to create a duplicate; rename or remove the conflicting link.`,
      )
    }

    if (existing) {
      const existingAuthorId = readRelationId(existing.user)

      if (existingAuthorId !== author.id) {
        throw new Error(
          `Seed link "${scenario.key}" already exists with author ${existingAuthorId}, but the manifest expects ${author.id} (${scenario.author}). Refusing to overwrite unrelated content; rename or remove the conflicting link.`,
        )
      }

      const updated = await payload.update({
        collection: 'links',
        id: existing.id,
        data,
        user: author,
        overrideAccess: false,
        depth: 0,
      })

      assertLinkScenario({ actual: updated, author, scenario, subfeedId: subfeed?.id })
      ids.set(scenario.key, updated.id)
      tally.reconciled += 1
      continue
    }

    const created = await payload.create({
      collection: 'links',
      data: {
        ...data,
        createdAt: offsetIsoFromReference(referenceNow, scenario.referenceNowOffsetHours),
        updatedAt: offsetIsoFromReference(referenceNow, scenario.referenceNowOffsetHours),
      },
      user: author,
      overrideAccess: false,
      depth: 0,
    })

    assertLinkScenario({ actual: created, author, scenario, subfeedId: subfeed?.id })
    ids.set(scenario.key, created.id)
    tally.created += 1
  }

  return { tally, ids }
}
