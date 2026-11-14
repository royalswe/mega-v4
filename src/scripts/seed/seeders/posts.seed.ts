import type { Payload } from 'payload'
import type { Post, User } from '@/payload-types'

import type { SeedSubfeeds } from './subfeeds.seed'
import {
  SEED_CONTENT_SCENARIOS,
  asLexicalRichText,
  createSeedTally,
  offsetIsoFromReference,
  readRelationId,
  type ContentScenarioKey,
  type SeedContentScenario,
  type SeedPostScenario,
} from './utils.seed'
import { requirePersona, requireSubfeed, type SeedContentResult } from './links.seed'
import type { SeedUsers } from './users.seed'

const assertPostScenario = ({
  actual,
  author,
  scenario,
  subfeedId,
}: {
  actual: Post
  author: User
  scenario: SeedPostScenario
  subfeedId?: number
}) => {
  const problems: string[] = []
  const expectedStatus = scenario.expectation === 'pending' ? 'pending' : 'published'

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
  if (actual.status !== expectedStatus) {
    problems.push(`status: expected ${expectedStatus}, got ${actual.status}`)
  }

  if (problems.length > 0) {
    throw new Error(
      `Seeded post "${scenario.key}" fell outside its scenario:\n  ${problems.join('\n  ')}`,
    )
  }
}

/**
 * Creates or reconciles the manifest's Post scenarios through the real
 * authorisation path. Restoring a published fixture to pending requires a
 * moderator because `status` is moderator-gated field access.
 */
export async function seedPosts(
  payload: Payload,
  users: SeedUsers,
  subfeeds: SeedSubfeeds,
  referenceNow: Date,
): Promise<SeedContentResult> {
  const tally = createSeedTally('posts')
  const ids = new Map<string, number>()
  const scenarios: SeedPostScenario[] = []

  for (const scenario of SEED_CONTENT_SCENARIOS as readonly SeedContentScenario[]) {
    if (scenario.kind === 'post') scenarios.push(scenario)
  }

  const slugs = scenarios.map((scenario) => scenario.key)

  const { docs: existingPosts } = await payload.find({
    collection: 'posts',
    where: { slug: { in: slugs } },
    limit: slugs.length,
    depth: 0,
    overrideAccess: true,
  })

  const existingBySlug = new Map(existingPosts.map((post) => [post.slug, post] as const))

  for (const scenario of scenarios) {
    const author = requirePersona(users, scenario.author)
    const subfeed =
      scenario.destination.feed === 'subfeed'
        ? requireSubfeed(subfeeds, scenario.destination.subfeed)
        : null
    const isPending = scenario.expectation === 'pending'

    const data = {
      title: scenario.title,
      slug: scenario.key,
      content: asLexicalRichText(scenario.body),
      type: scenario.type,
      user: author.id,
      feed: scenario.destination.feed,
      subfeed: subfeed?.id,
      tags: [...scenario.tags],
      nsfw: false,
      ...(isPending ? { status: 'pending' as const } : {}),
    }

    const existing = existingBySlug.get(scenario.key)

    if (existing) {
      const existingAuthorId = readRelationId(existing.user)

      if (existingAuthorId !== author.id) {
        throw new Error(
          `Seed post "${scenario.key}" already exists with author ${existingAuthorId}, but the manifest expects ${author.id} (${scenario.author}). Refusing to overwrite unrelated content; rename or remove the conflicting post.`,
        )
      }

      const updated = await payload.update({
        collection: 'posts',
        id: existing.id,
        data,
        user: isPending ? requirePersona(users, 'kalle') : author,
        overrideAccess: false,
        depth: 0,
      })

      const persisted = await payload.findByID({
        collection: 'posts',
        id: updated.id,
        depth: 0,
        overrideAccess: true,
      })
      assertPostScenario({ actual: persisted, author, scenario, subfeedId: subfeed?.id })
      ids.set(scenario.key, updated.id)
      tally.reconciled += 1
      continue
    }

    const createdAt = offsetIsoFromReference(referenceNow, scenario.referenceNowOffsetHours)
    const created = await payload.create({
      collection: 'posts',
      data: {
        ...data,
        createdAt,
        updatedAt: createdAt,
      },
      user: author,
      overrideAccess: false,
      depth: 0,
      ...(isPending ? { context: { forcePending: true } } : {}),
    })

    assertPostScenario({ actual: created, author, scenario, subfeedId: subfeed?.id })
    ids.set(scenario.key, created.id)
    tally.created += 1
  }

  return { tally, ids }
}
