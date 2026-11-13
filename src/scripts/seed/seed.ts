import { pathToFileURL } from 'node:url'
import { getPayload, type Payload } from 'payload'
import configPromise from '@payload-config'
import { isEligibleForMainFeedPromotion, buildMainFeedWhere } from '@/lib/community/promotion'
import { isTrustedUser } from '@/lib/community/userSignals'
import { seedUsers, reconcilePersonaStanding } from './seeders/users.seed'
import { seedSubfeeds } from './seeders/subfeeds.seed'
import { seedLinks } from './seeders/links.seed'
import { seedPosts } from './seeders/posts.seed'
import { seedComments } from './seeders/comments.seed'
import { seedVotes } from './seeders/votes.seed'
import { seedBookmarks } from './seeders/bookmarks.seed'
import { seedDiscoveries } from './seeders/discoveries.seed'
import { seedReports } from './seeders/reports.seed'
import {
  SEED_CONTENT_SCENARIOS,
  SEED_PERSONAS,
  SEED_SCENARIO_MANIFEST,
  SEED_SUBFEEDS,
  createSeedTally,
  getContentSignalProfile,
  offsetIsoFromReference,
  PROMOTED_EXPECTATIONS,
  readRelationId,
  resolveReferenceNow,
  type ContentScenarioKey,
  type SeedContentScenario,
  type SeedStepTally,
  type SeededContentIndex,
} from './seeders/utils.seed'

const logStep = (name: string) => {
  console.log(`\n[seed] ${name}`)
}

export interface RunSeedOptions {
  /** Reuse a caller-provided reference time (tests); defaults to the env helper. */
  referenceNow?: Date
}

export interface RunSeedResult {
  referenceNow: Date
  tallies: SeedStepTally[]
}

const targetKey = (kind: 'link' | 'post', id: number) => `${kind}:${id}`

const buildContentIndex = (
  linkIds: Map<string, number>,
  postIds: Map<string, number>,
): SeededContentIndex => {
  const index: SeededContentIndex = new Map()

  for (const [key, id] of linkIds) index.set(key, { kind: 'link', id })
  for (const [key, id] of postIds) index.set(key, { kind: 'post', id })

  if (index.size !== SEED_CONTENT_SCENARIOS.length) {
    throw new Error(
      `Seed content index has ${index.size} entries but the manifest declares ${SEED_CONTENT_SCENARIOS.length} scenarios.`,
    )
  }

  return index
}

const countSeedUsers = async (payload: Payload): Promise<number> => {
  const result = await payload.count({
    collection: 'users',
    where: { email: { in: SEED_PERSONAS.map((persona) => persona.email) } },
    overrideAccess: true,
  })

  return result.totalDocs
}

const countSeedSubfeeds = async (payload: Payload): Promise<number> => {
  const result = await payload.count({
    collection: 'subfeeds',
    where: { slug: { in: SEED_SUBFEEDS.map((subfeed) => subfeed.key) } },
    overrideAccess: true,
  })

  return result.totalDocs
}

interface TargetStats {
  commentsCount: number
  uniqueCommenters: number
  trustedInteractions: number
  discoveryMomentum: number
}

const collectTargetStats = async (
  payload: Payload,
  content: SeededContentIndex,
): Promise<Map<string, TargetStats>> => {
  const linkIds = [...content.values()].filter((entry) => entry.kind === 'link').map((e) => e.id)
  const postIds = [...content.values()].filter((entry) => entry.kind === 'post').map((e) => e.id)

  const [comments, votes, discoveries] = await Promise.all([
    payload.find({
      collection: 'comments',
      where: {
        or: [
          ...(linkIds.length > 0 ? [{ link: { in: linkIds } }] : []),
          ...(postIds.length > 0 ? [{ post: { in: postIds } }] : []),
        ],
      },
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'votes',
      where: {
        or: [
          ...(linkIds.length > 0 ? [{ link: { in: linkIds } }] : []),
          ...(postIds.length > 0 ? [{ post: { in: postIds } }] : []),
        ],
      },
      limit: 5000,
      depth: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'discoveries',
      where: { post: { in: postIds } },
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const stats = new Map<string, TargetStats>()

  const ensure = (key: string): TargetStats => {
    const existing = stats.get(key)
    if (existing) return existing

    const created: TargetStats = {
      commentsCount: 0,
      uniqueCommenters: 0,
      trustedInteractions: 0,
      discoveryMomentum: 0,
    }
    stats.set(key, created)
    return created
  }

  const commenters = new Map<string, Set<number>>()

  for (const comment of comments.docs) {
    if (comment.moderationStatus === 'removed') continue

    const kind = comment.link ? 'link' : comment.post ? 'post' : null
    const id = readRelationId(comment.link) ?? readRelationId(comment.post)
    const userId = readRelationId(comment.user)

    if (!kind || !id) continue

    const key = targetKey(kind, id)
    const entry = ensure(key)
    entry.commentsCount += 1

    if (userId) {
      const set = commenters.get(key) ?? new Set<number>()
      set.add(userId)
      commenters.set(key, set)
    }
  }

  for (const [key, set] of commenters) {
    ensure(key).uniqueCommenters = set.size
  }

  for (const vote of votes.docs) {
    const kind = vote.link ? 'link' : vote.post ? 'post' : null
    const id = readRelationId(vote.link) ?? readRelationId(vote.post)
    if (!kind || !id) continue

    if (isTrustedUser(vote.user)) {
      ensure(targetKey(kind, id)).trustedInteractions += 1
    }
  }

  const discoveryTotals = new Map<number, { engagement: number; count: number }>()

  for (const discovery of discoveries.docs) {
    const postId = readRelationId(discovery.post)
    if (!postId) continue

    const current = discoveryTotals.get(postId) ?? { engagement: 0, count: 0 }
    current.engagement += Math.max(0, discovery.engagementGenerated ?? 0)
    current.count += 1
    discoveryTotals.set(postId, current)
  }

  for (const [postId, total] of discoveryTotals) {
    ensure(targetKey('post', postId)).discoveryMomentum =
      Math.round((total.engagement + total.count * 8) * 100) / 100
  }

  return stats
}

const assertScenarioInvariants = async ({
  payload,
  content,
  referenceNow,
}: {
  payload: Payload
  content: SeededContentIndex
  referenceNow: Date
}) => {
  const problems: string[] = []

  for (const scenario of SEED_CONTENT_SCENARIOS as readonly SeedContentScenario[]) {
    const entry = content.get(scenario.key)

    if (!entry) {
      problems.push(`${scenario.key}: missing from the content index`)
      continue
    }

    const doc = await payload.findByID({
      collection: entry.kind === 'link' ? 'links' : 'posts',
      id: entry.id,
      depth: 0,
      overrideAccess: true,
    })

    const promoted = PROMOTED_EXPECTATIONS.has(scenario.expectation)
    const eligible = isEligibleForMainFeedPromotion(doc)

    if (doc.feed !== scenario.destination.feed) {
      problems.push(
        `${scenario.key}: feed expected ${scenario.destination.feed}, got ${doc.feed ?? 'none'}`,
      )
    }

    if (promoted !== eligible) {
      problems.push(
        `${scenario.key}: eligibleForMainFeed expected ${promoted}, got ${eligible} (featured=${doc.featured}, controversial=${doc.controversial}, quarantined=${doc.quarantined})`,
      )
    }

    if (promoted && doc.featured !== true) {
      problems.push(`${scenario.key}: promoted scenario is not featured`)
    }

    if (scenario.destination.feed === 'subfeed') {
      const subfeed = await payload.findByID({
        collection: 'subfeeds',
        id: (doc.subfeed as number | null) ?? 0,
        depth: 0,
        overrideAccess: true,
      })

      if (!subfeed || subfeed.slug !== scenario.destination.subfeed) {
        problems.push(
          `${scenario.key}: subfeed expected ${scenario.destination.subfeed}, got ${subfeed?.slug ?? 'none'}`,
        )
      }
    }

    if (scenario.kind === 'post') {
      const expectedStatus = scenario.expectation === 'pending' ? 'pending' : 'published'
      const post = doc as { status?: string | null }

      if (post.status !== expectedStatus) {
        problems.push(`${scenario.key}: status expected ${expectedStatus}, got ${post.status}`)
      }
    }

    if (scenario.expectation === 'quarantined' && doc.quarantined !== true) {
      problems.push(`${scenario.key}: quarantined flag was not applied`)
    }

    if (scenario.expectation === 'controversial' && doc.controversial !== true) {
      problems.push(`${scenario.key}: controversial flag was not derived`)
    }

    if (scenario.expectation === 'main-editorial') {
      const editorial = doc as {
        editorialPriority?: boolean | null
        editorialPriorityUntil?: string | null
      }
      const expectedUntil =
        scenario.editorialPriorityOffsetHours === undefined
          ? null
          : offsetIsoFromReference(referenceNow, scenario.editorialPriorityOffsetHours)

      if (editorial.editorialPriority !== true) {
        problems.push(`${scenario.key}: editorialPriority was not applied`)
      }

      if (
        expectedUntil &&
        new Date(editorial.editorialPriorityUntil ?? 0).getTime() !==
          new Date(expectedUntil).getTime()
      ) {
        problems.push(`${scenario.key}: editorialPriorityUntil expected ${expectedUntil}`)
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Seed scenario invariants failed:\n  ${problems.join('\n  ')}`)
  }
}

const assertMainFeedVisibility = async ({
  payload,
  content,
}: {
  payload: Payload
  content: SeededContentIndex
}) => {
  const [mainLinks, mainPosts] = await Promise.all([
    payload.find({
      collection: 'links',
      where: buildMainFeedWhere({ collection: 'links' }),
      limit: 500,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'posts',
      where: buildMainFeedWhere({ collection: 'posts' }),
      limit: 500,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const visible = {
    link: new Set(mainLinks.docs.map((doc) => doc.slug).filter(Boolean)),
    post: new Set(mainPosts.docs.map((doc) => doc.slug).filter(Boolean)),
  }

  const problems: string[] = []

  for (const scenario of SEED_CONTENT_SCENARIOS as readonly SeedContentScenario[]) {
    const expected =
      scenario.destination.feed === 'main' || PROMOTED_EXPECTATIONS.has(scenario.expectation)
    const actual = visible[scenario.kind].has(scenario.key)

    if (actual !== expected) {
      problems.push(
        `${scenario.key}: Main Feed visibility expected ${expected}, got ${actual} (${scenario.expectation})`,
      )
    }
  }

  if (problems.length > 0) {
    throw new Error(`Seed Main Feed visibility failed:\n  ${problems.join('\n  ')}`)
  }

  if (content.size !== SEED_CONTENT_SCENARIOS.length) {
    throw new Error('Seed Main Feed verification could not resolve every content scenario.')
  }
}

/**
 * Single deterministic reconciliation pass: apply the manifest's final signal and
 * moderation state, then assert every scenario invariant. Content update hooks
 * (`syncDerivedSignals`) re-derive ranking/controversy from these values.
 */
const reconcileContentSignals = async ({
  payload,
  content,
  referenceNow,
}: {
  payload: Payload
  content: SeededContentIndex
  referenceNow: Date
}) => {
  const stats = await collectTargetStats(payload, content)

  for (const scenario of SEED_CONTENT_SCENARIOS as readonly SeedContentScenario[]) {
    const entry = content.get(scenario.key)

    if (!entry) {
      throw new Error(`Seed content index is missing "${scenario.key}".`)
    }

    const profile = getContentSignalProfile(scenario.expectation)
    const targetStats = stats.get(targetKey(entry.kind, entry.id)) ?? {
      commentsCount: 0,
      uniqueCommenters: 0,
      trustedInteractions: 0,
      discoveryMomentum: 0,
    }
    const editorialPriorityUntil =
      scenario.editorialPriorityOffsetHours === undefined
        ? null
        : offsetIsoFromReference(referenceNow, scenario.editorialPriorityOffsetHours)
    const editorialPriority = scenario.editorialPriorityOffsetHours !== undefined
    const quarantined = scenario.expectation === 'quarantined'

    const shared = {
      upvotes: profile.upvotes,
      downvotes: profile.downvotes,
      commentsCount: targetStats.commentsCount,
      sharesCount: profile.sharesCount,
      uniqueCommenters: targetStats.uniqueCommenters,
      trustedInteractions: targetStats.trustedInteractions,
      featured: profile.featured,
      quarantined,
      editorialPriority,
      editorialPriorityUntil,
    }

    if (scenario.kind === 'link') {
      await payload.update({
        collection: 'links',
        id: entry.id,
        data: {
          ...shared,
          clickCount: profile.clickCount,
          softDeleted: false,
          _status: 'published',
          createdAt: offsetIsoFromReference(referenceNow, scenario.referenceNowOffsetHours),
        },
        overrideAccess: true,
        depth: 0,
      })
    } else {
      await payload.update({
        collection: 'posts',
        id: entry.id,
        data: {
          ...shared,
          discoveryMomentum: profile.discoveryMomentum,
          status: scenario.expectation === 'pending' ? 'pending' : 'published',
          createdAt: offsetIsoFromReference(referenceNow, scenario.referenceNowOffsetHours),
        },
        overrideAccess: true,
        depth: 0,
      })
    }
  }

  await assertScenarioInvariants({ payload, content, referenceNow })
  await assertMainFeedVisibility({ payload, content })
}

/**
 * Runs the whole curated seed: content → interactions → reconcile → verify →
 * summary. Safe to run repeatedly: every collection reconciles by natural key.
 */
export async function runSeed(
  payload: Payload,
  options: RunSeedOptions = {},
): Promise<RunSeedResult> {
  const referenceNow = options.referenceNow ?? resolveReferenceNow()
  const tallies: SeedStepTally[] = []

  console.log(`[seed] reference time: ${referenceNow.toISOString()}`)

  logStep('1/10 personas')
  const usersBefore = await countSeedUsers(payload)
  const users = await seedUsers(payload, referenceNow)
  const usersAfter = await countSeedUsers(payload)
  const usersCreated = usersAfter - usersBefore
  tallies.push({
    collection: 'users',
    created: usersCreated,
    reconciled: users.size - usersCreated,
    skipped: 0,
  })

  logStep('2/10 SubFeeds')
  const subfeedsBefore = await countSeedSubfeeds(payload)
  const subfeeds = await seedSubfeeds(payload, users, referenceNow)
  const subfeedsAfter = await countSeedSubfeeds(payload)
  const subfeedsCreated = subfeedsAfter - subfeedsBefore
  tallies.push({
    collection: 'subfeeds',
    created: subfeedsCreated,
    reconciled: subfeeds.size - subfeedsCreated,
    skipped: 0,
  })

  logStep('3/10 links')
  const links = await seedLinks(payload, users, subfeeds, referenceNow)
  tallies.push(links.tally)

  logStep('4/10 posts')
  const posts = await seedPosts(payload, users, subfeeds, referenceNow)
  tallies.push(posts.tally)

  const content = buildContentIndex(links.ids, posts.ids)

  logStep('5/10 comments')
  const comments = await seedComments(payload, users, content, referenceNow)
  tallies.push(comments.tally)

  logStep('6/10 votes')
  tallies.push(await seedVotes(payload, users, content, referenceNow))

  logStep('7/10 bookmarks')
  tallies.push(await seedBookmarks(payload, users, content, referenceNow))

  logStep('8/10 discoveries')
  tallies.push(await seedDiscoveries(payload, users, content, referenceNow))

  logStep('9/10 reports')
  tallies.push(await seedReports(payload, users, content, referenceNow))

  logStep('10/10 reconcile signals and standing')
  await reconcileContentSignals({ payload, content, referenceNow })
  await reconcilePersonaStanding(payload, referenceNow)

  console.log('\nSeed summary')
  console.table(tallies.map((tally) => ({ ...tally })))
  console.log('\nContent scenarios')
  for (const scenario of SEED_CONTENT_SCENARIOS as readonly SeedContentScenario[]) {
    console.log(
      `  ${scenario.kind.padEnd(4)} ${scenario.key.padEnd(46)} ${scenario.expectation.padEnd(24)} feed=${scenario.destination.feed}${scenario.destination.feed === 'subfeed' ? `:${scenario.destination.subfeed}` : ''}`,
    )
  }
  console.log(
    `\nSeed pipeline complete: ${SEED_SCENARIO_MANIFEST.personas.length} personas, ${SEED_SCENARIO_MANIFEST.subfeeds.length} SubFeeds, ${SEED_SCENARIO_MANIFEST.content.length} content scenarios, ${SEED_SCENARIO_MANIFEST.interactions.length} interactions.`,
  )

  return { referenceNow, tallies }
}

async function main() {
  const payload = await getPayload({ config: configPromise })

  try {
    await runSeed(payload)
    await payload.destroy()
    process.exitCode = 0
  } catch (error) {
    console.error(error)
    process.exitCode = 1
    await payload.destroy().catch(() => undefined)
  }

  process.exit(process.exitCode ?? 0)
}

const isDirectRun =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  void main()
}
