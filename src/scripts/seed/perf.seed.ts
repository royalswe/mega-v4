import { getPayload } from 'payload'
import configPromise from '@payload-config'

import { checkRole } from '@/access/checkRole'
import { asLexicalRichText, offsetIsoFromReference } from './seeders/utils.seed'

/**
 * Performance-test data seeder. Separate from the curated seed (`pnpm run seed`)
 * so the curated scenarios stay small and readable (see issue #27).
 *
 * Additive and re-runnable: every run gets a unique prefix, so re-running grows
 * the dataset instead of colliding. Data is created through the real create
 * path (hooks run, signals compute) with `overrideAccess: true` and no actor,
 * so main-feed targeting is allowed without a persona holding a publishing
 * role. Subfeed-targeted items always use an author who is a member of that
 * SubFeed (the subfeed authorisation rule).
 *
 * Usage:
 *   pnpm run seed:perf                                  # defaults below
 *   PERF_LINKS=2000 PERF_POSTS=400 pnpm run seed:perf   # bigger dataset
 *   PERF_RUN=abc pnpm run seed:perf                     # reproducible prefix
 */

const num = (key: string, fallback: number): number => {
  const raw = Number.parseInt(process.env[key] ?? '', 10)
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

const PERF_LINKS = num('PERF_LINKS', 300)
const PERF_POSTS = num('PERF_POSTS', 60)
const PERF_SUBFEEDS = num('PERF_SUBFEEDS', 10)
const PERF_HOURS_SPREAD = num('PERF_HOURS_SPREAD', 24 * 30)
const RUN = (process.env.PERF_RUN ?? Math.random().toString(36).slice(2, 8)).toLowerCase()

const LINK_TYPES = ['article', 'video', 'image', 'audio', 'game'] as const

const TOPICS = [
  'postgres index strategies',
  'turbopack cold starts',
  'css subgrid card rhythm',
  'sqlite backup hygiene',
  'rss reader benchmarks',
  'drizzle migration pitfalls',
  'keyboard-first navigation',
  'webring revival kits',
  'privacy-first analytics',
  'job queue patterns',
  'local embedding latency',
  'design token drift',
  'edge cache invalidation',
  'websocket backpressure',
  'font subsetting wins',
]

const POST_TYPES = ['discussion', 'article', 'link'] as const

const fill = (topic: string, sentences: number): string =>
  Array.from({ length: sentences }, (_, i) =>
    i === 0
      ? `Field notes on ${topic} after a week of real traffic.`
      : `Follow-up ${i}: the ${topic} approach held up better than expected under load, with caveats worth writing down.`,
  ).join(' ')

async function main(): Promise<void> {
  const payload = await getPayload({ config: configPromise })
  const startedAt = Date.now()
  const referenceNow = new Date()
  let subfeedCount = 0
  let linkCount = 0
  let postCount = 0

  try {
    const { docs: personas } = await payload.find({
      collection: 'users',
      limit: 50,
      depth: 0,
      overrideAccess: true,
    })

    if (personas.length === 0) {
      throw new Error('No users found. Run `pnpm run seed` first so perf content has authors.')
    }

    // The Links collection auto-publishes creations only for requests with an
    // actor, and Main-Feed/SubFeed targeting requires a publishing role — so
    // every create runs as a site moderator persona. Author variety is kept by
    // writing `user` per item (the actor is a moderator, so the personal-first
    // author override does not apply).
    const actor = personas.find((persona) =>
      checkRole(['admin', 'moderator', 'editor'], persona),
    )
    if (!actor) {
      throw new Error(
        'No admin/moderator/editor persona found. Run `pnpm run seed` first — perf content is created through the real authorisation path.',
      )
    }

    console.log(
      `[perf-seed] run=${RUN} authors=${personas.length} actor=${actor.username ?? actor.id} links=${PERF_LINKS} posts=${PERF_POSTS} subfeeds=${PERF_SUBFEEDS}`,
    )

    // SubFeeds, with personas as members so subfeed-targeted content has a
    // legitimate author set.
    const subfeedAuthorSets: Array<number[]> = []
    const subfeedIds: number[] = []
    const memberIds = personas.slice(0, Math.min(5, personas.length)).map((p) => p.id)

    for (let i = 0; i < PERF_SUBFEEDS; i++) {
      const created = await payload.create({
        collection: 'subfeeds',
        data: {
          name: `Perf Feed ${RUN} ${i}`,
          slug: `perf-${RUN}-${i}`,
          description: `Performance-test SubFeed ${i} for run ${RUN}.`,
          owner: memberIds[0],
          moderators: memberIds,
          members: memberIds,
        },
        user: actor,
        depth: 0,
        overrideAccess: true,
      })
      subfeedIds.push(created.id)
      subfeedAuthorSets.push(memberIds)
      subfeedCount += 1
      if (subfeedCount % 5 === 0) {
        console.log(`[perf-seed] subfeeds ${subfeedCount}/${PERF_SUBFEEDS} (${elapsed(startedAt)}s)`)
      }
    }

    // Links: mostly Main Feed (so they appear in the Home feed query), some
    // User Feed and SubFeed items, varied types/descriptions/ages/NSFW.
    for (let i = 0; i < PERF_LINKS; i++) {
      const topic = TOPICS[i % TOPICS.length]
      const feedKind = i % 5 === 0 ? 'user' : i % 9 === 0 ? 'subfeed' : 'main'
      const subfeedIndex =
        feedKind === 'subfeed' && subfeedIds.length > 0 ? i % subfeedIds.length : -1
      const authors =
        feedKind === 'subfeed' && subfeedIndex >= 0
          ? subfeedAuthorSets[subfeedIndex]
          : memberIds
      const author = authors[i % authors.length]
      const descriptionKind = i % 3
      const ageHours = i % PERF_HOURS_SPREAD

      await payload.create({
        collection: 'links',
        data: {
          title: `Perf link ${RUN} #${i}: ${topic}`,
          slug: `perf-${RUN}-link-${i}`,
          url: `https://perf.example/${RUN}/link-${i}`,
          description:
            descriptionKind === 0
              ? ''
              : descriptionKind === 1
                ? `Short note about ${topic}.`
                : fill(topic, 4 + (i % 4)),
          type: LINK_TYPES[i % LINK_TYPES.length],
          user: author,
          feed: feedKind,
          subfeed: subfeedIndex >= 0 ? subfeedIds[subfeedIndex] : undefined,
          tags: ['perf', topic.split(' ')[0]],
          nsfw: i % 40 === 39,
          createdAt: offsetIsoFromReference(referenceNow, -ageHours),
          updatedAt: offsetIsoFromReference(referenceNow, -ageHours),
        },
        user: actor,
        depth: 0,
        overrideAccess: true,
      })

      linkCount += 1
      if (linkCount % 50 === 0) {
        console.log(`[perf-seed] links ${linkCount}/${PERF_LINKS} (${elapsed(startedAt)}s)`)
      }
    }

    // Posts: published discussions with varying content lengths.
    for (let i = 0; i < PERF_POSTS; i++) {
      const topic = TOPICS[i % TOPICS.length]
      const feedKind = i % 5 === 0 ? 'user' : i % 9 === 0 ? 'subfeed' : 'main'
      const subfeedIndex =
        feedKind === 'subfeed' && subfeedIds.length > 0 ? i % subfeedIds.length : -1
      const authors =
        feedKind === 'subfeed' && subfeedIndex >= 0
          ? subfeedAuthorSets[subfeedIndex]
          : memberIds
      const author = authors[i % authors.length]
      const ageHours = i % PERF_HOURS_SPREAD

      await payload.create({
        collection: 'posts',
        data: {
          title: `Perf post ${RUN} #${i}: ${topic}`,
          slug: `perf-${RUN}-post-${i}`,
          type: POST_TYPES[i % POST_TYPES.length],
          content: asLexicalRichText(fill(topic, 2 + (i % 5))),
          user: author,
          feed: feedKind,
          subfeed: subfeedIndex >= 0 ? subfeedIds[subfeedIndex] : undefined,
          status: 'published',
          nsfw: false,
          createdAt: offsetIsoFromReference(referenceNow, -ageHours),
          updatedAt: offsetIsoFromReference(referenceNow, -ageHours),
        },
        user: actor,
        depth: 0,
        overrideAccess: true,
      })

      postCount += 1
      if (postCount % 25 === 0) {
        console.log(`[perf-seed] posts ${postCount}/${PERF_POSTS} (${elapsed(startedAt)}s)`)
      }
    }

    console.log(
      `[perf-seed] done in ${elapsed(startedAt)}s — ${linkCount} links, ${postCount} posts, ${subfeedCount} subfeeds (prefix "${RUN}")`,
    )
  } finally {
    await payload.destroy()
  }
}

const elapsed = (startedAt: number): number => Math.round((Date.now() - startedAt) / 1000)

void main().catch((error: unknown) => {
  console.error('[perf-seed] failed:', error)
  process.exitCode = 1
})
