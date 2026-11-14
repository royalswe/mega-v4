import type { Payload } from 'payload'
import type { User } from '@/payload-types'

import { faker } from '@faker-js/faker'

/**
 * Domain fixtures for integration and end-to-end tests.
 *
 * Two adapters cross this interface: Vitest drives the Payload Local API, and the
 * Playwright setup drives the same Local API from a browser process. Everything
 * below is Payload-agnostic apart from the client that is passed in, so the two
 * runners cannot drift into different ideas of what a "member with standing" or a
 * "quarantined featured link" is.
 */

export const uniqueToken = (length = 10): string =>
  faker.string.alphanumeric(length).toLowerCase()

/** The Lexical document shape Payload expects for rich-text bodies. */
export const createRichText = (text: string) => ({
  root: {
    children: [
      {
        children: [
          {
            detail: 0 as const,
            format: 0 as const,
            mode: 'normal' as const,
            style: '',
            text,
            type: 'text' as const,
            version: 1 as const,
          },
        ],
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0,
        type: 'paragraph' as const,
        version: 1 as const,
        textFormat: 0 as const,
        textStyle: '',
      },
    ],
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    type: 'root' as const,
    version: 1,
  },
})

/**
 * Promise-lock for `getPayload`, so a runner that imports several spec files
 * cannot initialise the client twice. The caller supplies how to load the config,
 * because Vitest resolves `@/payload.config` through Vite and Playwright resolves
 * `@payload-config` through its own loader.
 */
export const createPayloadLoader = (loadConfig: () => Promise<unknown>) => {
  let cached: Payload | null = null
  let inflight: Promise<Payload> | null = null

  return async (): Promise<Payload> => {
    if (cached) return cached
    if (inflight) return inflight

    inflight = (async () => {
      const { getPayload } = await import('payload')
      const config = await loadConfig()
      cached = await getPayload({ config: config as never })
      return cached
    })()

    try {
      return await inflight
    } finally {
      inflight = null
    }
  }
}

/** Standing fields live top-level on `users`; the engine re-derives roles from them. */
export interface MemberSignals {
  discoveryScore?: number
  contributionScore?: number
  interactionScore?: number
  likabilityScore?: number
  cleaningScore?: number
  recruiterScore?: number
  moderationScore?: number
  securityScore?: number
  legacyContributionScore?: number
  streakDays?: number
  lastActiveAt?: string
}

export interface MemberOptions extends MemberSignals {
  email?: string
  username?: string
  password?: string
  roles?: Array<'admin' | 'cleaner' | 'editor' | 'moderator' | 'recruiter' | 'uploader' | 'user'>
  settings?: { nsfw?: boolean; language?: 'en' | 'sv' }
}

/** A created member document. */
export type Member = User

/**
 * Creates a member with an isolated identity. Usernames and emails are unique
 * across the whole database, not just the run, so every fixture carries a token.
 */
export const createMember = async (
  payload: Payload,
  options: MemberOptions = {},
): Promise<Member> => {
  const token = uniqueToken(12)
  const email = options.email ?? `${token}-${faker.internet.email()}`
  const username = options.username ?? `${faker.internet.username()}-${token}`

  return payload.create({
    collection: 'users',
    data: {
      email,
      username,
      password: options.password ?? faker.internet.password(),
      ...(options.roles ? { roles: options.roles } : {}),
      discoveryScore: options.discoveryScore ?? 0,
      contributionScore: options.contributionScore ?? 0,
      interactionScore: options.interactionScore ?? 0,
      likabilityScore: options.likabilityScore ?? 0,
      cleaningScore: options.cleaningScore ?? 0,
      recruiterScore: options.recruiterScore ?? 0,
      moderationScore: options.moderationScore ?? 0,
      securityScore: options.securityScore ?? 0,
      legacyContributionScore: options.legacyContributionScore ?? 0,
      streakDays: options.streakDays ?? 0,
      lastActiveAt: options.lastActiveAt ?? new Date().toISOString(),
      settings: {
        nsfw: options.settings?.nsfw ?? false,
        language: options.settings?.language ?? ('en' as const),
      },
    },
    draft: false,
    overrideAccess: true,
  })
}

/**
 * Idempotent variant for browser fixtures, whose identities must stay stable
 * between runs (the login email and the profile URL are shared with the spec).
 */
export const findOrCreateMember = async (
  payload: Payload,
  options: MemberOptions & { email: string },
): Promise<Member> => {
  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: options.email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const existing = docs[0]
  if (!existing) return createMember(payload, options)

  return payload.update({
    collection: 'users',
    id: existing.id,
    data: {
      username: options.username ?? existing.username,
      ...(options.password ? { password: options.password } : {}),
      ...(options.roles ? { roles: options.roles } : {}),
      discoveryScore: options.discoveryScore ?? 0,
      contributionScore: options.contributionScore ?? 0,
      interactionScore: options.interactionScore ?? 0,
      likabilityScore: options.likabilityScore ?? 0,
      cleaningScore: options.cleaningScore ?? 0,
      recruiterScore: options.recruiterScore ?? 0,
      moderationScore: options.moderationScore ?? 0,
      securityScore: options.securityScore ?? 0,
      legacyContributionScore: options.legacyContributionScore ?? 0,
      streakDays: options.streakDays ?? 0,
      lastActiveAt: options.lastActiveAt ?? new Date().toISOString(),
    },
    overrideAccess: true,
  })
}

export interface SubfeedOptions {
  ownerId: number
  /** Overrides `ownerId` for legacy-roster scenarios. */
  owner?: number
  members?: number[]
  moderators?: number[]
  editors?: number[]
  uploaders?: number[]
  name?: string
  description?: string
  prefix?: string
}

/** A Subfeed whose roster is owned by `ownerId` and includes them as moderator. */
export const createSubfeedWithRoster = async (payload: Payload, options: SubfeedOptions) => {
  const slug = `${options.prefix ?? 'fixture'}-subfeed-${uniqueToken(8)}`
  const owner = options.owner ?? options.ownerId
  // `name` is unique on the collection, so a fixed label would collide on the
  // second run against the same database.
  const name = `${options.name ?? 'Fixture SubFeed'} ${uniqueToken(6)}`

  return payload.create({
    collection: 'subfeeds',
    data: {
      name,
      slug,
      description: options.description ?? `Integration test subfeed ${slug}`,
      owner,
      moderators: options.moderators ?? [owner],
      editors: options.editors ?? [],
      uploaders: options.uploaders ?? [],
      members: options.members ?? [owner],
    },
    draft: false,
    overrideAccess: true,
  })
}

export type FeedItemCollection = 'links' | 'posts'
export type FeedOrigin = 'main' | 'user' | 'subfeed'

/** The lifecycle states the feed queries discriminate on. */
export type FeedItemState =
  | 'published'
  | 'draft'
  | 'pending'
  | 'removed'
  | 'quarantined'
  | 'soft-deleted'

export interface FeedItemSignals {
  upvotes?: number
  downvotes?: number
  featured?: boolean
  discoveryBoosted?: boolean
  nsfw?: boolean
  tags?: string[]
  /** Admin actor, needed when writing moderator-only fields such as `discoveryBoosted`. */
  actor?: unknown
}

export interface FeedItemSpec {
  collection: FeedItemCollection
  /** The author. */
  user: number
  feed?: FeedOrigin
  subfeedId?: number
  title?: string
  /** Prefix for the generated title, so a spec's titles stay recognisable. */
  titlePrefix?: string
  state?: FeedItemState
  signals?: FeedItemSignals
  /** Overrides the generated Lexical body (posts only). */
  body?: string
}

/**
 * One builder for every Link and Post a feed test needs, across all three origins
 * and all five lifecycle states. The awkward parts — forcing a pending Post to
 * published, sending drafts as drafts, writing the moderator-only boost flags —
 * live here instead of in each spec.
 */
export const createFeedItem = async (payload: Payload, spec: FeedItemSpec) => {
  const isLink = spec.collection === 'links'
  const feed = spec.feed ?? 'user'
  const state = spec.state ?? 'published'
  const token = uniqueToken(10)
  const signals = spec.signals ?? {}

  const shared = {
    title: spec.title ?? `${spec.titlePrefix ?? 'Fixture'} ${isLink ? 'Link' : 'Post'} ${token}`,
    user: spec.user,
    feed,
    subfeed: spec.subfeedId,
    upvotes: signals.upvotes ?? 0,
    downvotes: signals.downvotes ?? 0,
    featured: signals.featured ?? false,
    discoveryBoosted: signals.discoveryBoosted ?? false,
    quarantined: state === 'quarantined',
    nsfw: signals.nsfw ?? false,
    tags: signals.tags,
  }

  if (isLink) {
    const draft = state === 'draft'

    return payload.create({
      collection: 'links',
      data: {
        ...shared,
        url: `https://example.com/${token}`,
        type: 'article',
        softDeleted: state === 'soft-deleted',
        _status: draft ? 'draft' : 'published',
      },
      draft,
      overrideAccess: true,
      user: signals.actor as never,
    })
  }

  const post = await payload.create({
    collection: 'posts',
    data: {
      ...shared,
      content: createRichText(spec.body ?? faker.lorem.sentence()),
      type: 'discussion',
      ...(state === 'removed' ? { status: 'removed' as const } : {}),
    },
    overrideAccess: true,
    user: signals.actor as never,
    context: state === 'pending' ? { forcePending: true } : undefined,
  })

  // Posts default non-Subfeed content to `pending`; a published fixture has to be
  // promoted explicitly, in one place rather than in every spec.
  if (state === 'published' && post.status !== 'published') {
    return payload.update({
      collection: 'posts',
      id: post.id,
      data: { status: 'published' },
      overrideAccess: true,
      user: signals.actor as never,
    })
  }

  return post
}

export interface ScenarioMemberSpec extends MemberOptions {
  key: string
}

export interface CommunityScenario {
  members: Record<string, Member>
}

/**
 * Seeds the members a scenario names, and hands back a keyed map so a spec reads
 * `scenario.members.qualified` rather than juggling positional destructuring.
 */
export const seedMembers = async (
  payload: Payload,
  members: ScenarioMemberSpec[],
): Promise<CommunityScenario> => {
  const created = await Promise.all(
    members.map(async (member) => {
      const { key, ...options } = member
      return [key, await createMember(payload, options)] as const
    }),
  )

  return { members: Object.fromEntries(created) }
}
