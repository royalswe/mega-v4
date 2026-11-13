import type { CommunityRole, TrustLevel } from '@/lib/community/reputation'

/**
 * Deterministic seed helpers and the single source of truth for the curated
 * community scenario (Issue #27).
 *
 * This module contains no random generation. Every persona, SubFeed, content
 * item and interaction has a stable semantic key so that a second
 * `pnpm run seed` reconciles the same fictional community instead of appending a
 * new random one.
 */

/* -------------------------------------------------------------------------- */
/* Reference time                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One reference time per seed run. Time-sensitive fixtures store offsets against
 * this value so recency, editorial priority and activity are intentional.
 *
 * Defaults to "now"; set `SEED_REFERENCE_TIME` to an ISO timestamp to pin the
 * simulated present (for example when reproducing a screenshot or a test).
 */
export const resolveReferenceNow = (env: NodeJS.ProcessEnv = process.env): Date => {
  const raw = env.SEED_REFERENCE_TIME?.trim()

  if (raw) {
    const parsed = Date.parse(raw)

    if (Number.isNaN(parsed)) {
      throw new Error(
        `SEED_REFERENCE_TIME is not a valid date: "${raw}". Use an ISO timestamp such as "2026-11-12T09:00:00Z".`,
      )
    }

    return new Date(parsed)
  }

  return new Date()
}

/** ISO timestamp at `hoursOffset` hours from `referenceNow` (negative = past). */
export const offsetIsoFromReference = (referenceNow: Date, hoursOffset: number): string =>
  new Date(referenceNow.getTime() + hoursOffset * 3_600_000).toISOString()

/* -------------------------------------------------------------------------- */
/* Curated scenario types                                                     */
/* -------------------------------------------------------------------------- */

export type PersonaKey =
  'astrid' | 'malin' | 'soren' | 'linnea' | 'henrik' | 'freja' | 'kalle' | 'alva'

export type SubfeedKey = 'nordic-indie-web' | 'craft-design-systems' | 'applied-ai-notes'

export interface SeedPersonaSignals {
  discoveryScore: number
  contributionScore: number
  interactionScore: number
  cleaningScore: number
  moderationScore: number
  securityScore: number
  recruiterScore: number
  likabilityScore: number
  legacyContributionScore: number
}

export interface SeedPersona {
  key: PersonaKey
  email: string
  username: string
  password: string
  bio: string
  language: 'en' | 'sv'
  /** Human-readable topical interests, used by content authors. */
  interests: readonly string[]
  /** Input signals for `syncCommunityProfile`; roles are derived by hooks. */
  scores: SeedPersonaSignals
  streakDays: number
  /** `lastActiveAt = referenceNow + lastActiveOffsetHours` (negative = earlier). */
  lastActiveOffsetHours: number
  /** Roles the seeder supplies before automatic derivation runs. */
  manualRoles: readonly CommunityRole[]
  /** Exact post-hook role set, asserted after every write. */
  expectedRoles: readonly CommunityRole[]
  /** Post-hook trust level, asserted after every write. */
  expectedTrustLevel: TrustLevel
  /** Short human description of the behaviour this persona demonstrates. */
  scenario: string
}

export interface SeedSubfeed {
  key: SubfeedKey
  name: string
  description: string
  rules: string
  theme: string
  featured: boolean
  owner: PersonaKey
  moderators: readonly PersonaKey[]
  editors: readonly PersonaKey[]
  uploaders: readonly PersonaKey[]
  members: readonly PersonaKey[]
}

export type ContentScenarioKind = 'link' | 'post'

export type LinkScenarioType = 'article' | 'video' | 'image' | 'audio' | 'game'
export type PostScenarioType = 'link' | 'article' | 'image' | 'video' | 'discussion'

export type ContentScenarioDestination =
  { feed: 'user' } | { feed: 'subfeed'; subfeed: SubfeedKey } | { feed: 'main' }

export type ContentScenarioExpectation =
  | 'personal-unpromoted'
  | 'personal-promoted'
  | 'local-subfeed-unpromoted'
  | 'local-subfeed-promoted'
  | 'main-editorial'
  | 'pending'
  | 'quarantined'
  | 'controversial'

interface SeedContentScenarioBase {
  /** Stable natural key; also the seeded `slug`. */
  key: string
  author: PersonaKey
  destination: ContentScenarioDestination
  expectation: ContentScenarioExpectation
  /** `createdAt = referenceNow + referenceNowOffsetHours` (negative = earlier). */
  referenceNowOffsetHours: number
  /**
   * Optional editorial priority deadline offset. Positive = still active,
   * negative = already expired.
   */
  editorialPriorityOffsetHours?: number
  title: string
  tags: readonly string[]
  /** Short internal note describing the scenario's purpose. */
  summary: string
}

export interface SeedLinkScenario extends SeedContentScenarioBase {
  kind: 'link'
  type: LinkScenarioType
  url: string
  description: string
}

export interface SeedPostScenario extends SeedContentScenarioBase {
  kind: 'post'
  type: PostScenarioType
  /** One or more paragraphs of authored body copy. */
  body: readonly string[]
}

export type SeedContentScenario = SeedLinkScenario | SeedPostScenario

export type ReportReason = 'spam' | 'abuse' | 'broken_link' | 'harassment' | 'nsfw' | 'other'

export type InteractionScenarioKind = 'comment' | 'vote' | 'bookmark' | 'discovery' | 'report'

export interface SeedInteractionScenario {
  /** Stable natural key used by the interaction seeders. */
  key: string
  kind: InteractionScenarioKind
  actor: PersonaKey
  /** Content scenario key the interaction points at. */
  target: ContentScenarioKey
  /** For replies: the comment scenario key this comment answers. */
  parentKey?: string
  /** For votes only. */
  value?: 'up' | 'down'
  referenceNowOffsetHours: number
  /** Comments only: the visible comment body. */
  text?: string
  /** Reports only. */
  reason?: ReportReason
  /** Reports only: the visible report details. */
  details?: string
  /** Discoveries only: deterministic engagement attributed to the discovery. */
  engagementGenerated?: number
  /** Internal note describing why the interaction is in the scenario. */
  note: string
}

/**
 * Curated final engagement for each scenario role.
 *
 * These values are applied in the single post-interaction reconciliation pass so
 * the demo always lands on the same promoted / unpromoted / pending /
 * quarantined / controversial states, regardless of what `recalculateTargetSignals`
 * derived from the interaction rows. `clickCount` feeds link discovery momentum
 * (`clickCount * 0.35`), while posts use `discoveryMomentum` directly.
 */
export interface ContentSignalProfile {
  clickCount: number
  upvotes: number
  downvotes: number
  sharesCount: number
  discoveryMomentum: number
  featured: boolean
}

export const CONTENT_SIGNAL_PROFILES: Record<ContentScenarioExpectation, ContentSignalProfile> = {
  'personal-unpromoted': {
    clickCount: 6,
    upvotes: 3,
    downvotes: 0,
    sharesCount: 0,
    discoveryMomentum: 1,
    featured: false,
  },
  'personal-promoted': {
    clickCount: 40,
    upvotes: 12,
    downvotes: 0,
    sharesCount: 2,
    discoveryMomentum: 14,
    featured: true,
  },
  'local-subfeed-unpromoted': {
    clickCount: 6,
    upvotes: 3,
    downvotes: 0,
    sharesCount: 0,
    discoveryMomentum: 1,
    featured: false,
  },
  'local-subfeed-promoted': {
    clickCount: 40,
    upvotes: 12,
    downvotes: 0,
    sharesCount: 2,
    discoveryMomentum: 14,
    featured: true,
  },
  'main-editorial': {
    clickCount: 18,
    upvotes: 7,
    downvotes: 0,
    sharesCount: 2,
    discoveryMomentum: 8,
    featured: false,
  },
  pending: {
    clickCount: 0,
    upvotes: 0,
    downvotes: 0,
    sharesCount: 0,
    discoveryMomentum: 0,
    featured: false,
  },
  quarantined: {
    clickCount: 24,
    upvotes: 2,
    downvotes: 3,
    sharesCount: 0,
    discoveryMomentum: 6,
    featured: false,
  },
  controversial: {
    clickCount: 32,
    upvotes: 9,
    downvotes: 8,
    sharesCount: 1,
    discoveryMomentum: 10,
    // Deliberately featured to prove the safety exclusions win over the fast path.
    featured: true,
  },
}

/** Per-collection tally printed in the seed summary. */
export interface SeedStepTally {
  collection: string
  created: number
  reconciled: number
  skipped: number
}

export const createSeedTally = (collection: string): SeedStepTally => ({
  collection,
  created: 0,
  reconciled: 0,
  skipped: 0,
})

/** Resolved ids for the manifest content scenarios, keyed by scenario key. */
export interface SeededContentIndexEntry {
  kind: ContentScenarioKind
  id: number
}

export type SeededContentIndex = Map<string, SeededContentIndexEntry>

/* -------------------------------------------------------------------------- */
/* Personas                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Standing signals are the final documented values. They are chosen so the
 * post-hook derivation in `src/collections/Users/index.ts` lands on the roles
 * below (weighted TMV = discovery*1.6 + contribution*1.35 + likability*1.25 +
 * interaction*0.85 + cleaning*0.55 + recruiter*0.9 + legacy*0.35 + security*0.4).
 *
 * key        weighted TMV  trustLevel  automatic roles
 * astrid     0             newcomer    -
 * malin      48            regular     -
 * soren      416           trusted     uploader (contribution 200), recruiter (trusted + contribution >= 120)
 * linnea     58            regular     -
 * henrik     322           trusted     uploader (contribution 130), recruiter
 * freja      651           veteran     uploader, editor (contribution 300 + interaction 110), recruiter
 * kalle      383           trusted     uploader, moderator/cleaner (cleaning 120), recruiter
 * alva       1135          curator     admin is manual; uploader, editor, moderator, cleaner, recruiter derive
 */
export const SEED_PERSONAS = [
  {
    key: 'astrid',
    email: 'astrid@example.com',
    username: 'astrid',
    password: 'password123',
    bio: 'Newcomer and product designer in Malmö, learning to build small tools for myself. Reading more than posting while I find my footing here.',
    language: 'en',
    interests: ['small tools', 'RSS', 'local-first notes'],
    scores: {
      discoveryScore: 0,
      contributionScore: 0,
      interactionScore: 0,
      cleaningScore: 0,
      moderationScore: 0,
      securityScore: 0,
      recruiterScore: 0,
      likabilityScore: 0,
      legacyContributionScore: 0,
    },
    streakDays: 1,
    lastActiveOffsetHours: -6,
    manualRoles: ['user'],
    expectedRoles: ['user'],
    expectedTrustLevel: 'newcomer',
    scenario: 'Newcomer with no joined SubFeeds, publishing only to her own User Feed.',
  },
  {
    key: 'malin',
    email: 'malin@example.com',
    username: 'malin',
    password: 'password123',
    bio: 'Accessibility consultant in Gothenburg. I join communities to listen, bookmark good references, and keep notes on contrast, focus and inclusive defaults.',
    language: 'en',
    interests: ['accessibility', 'design tokens', 'inclusive defaults'],
    scores: {
      discoveryScore: 0,
      contributionScore: 20,
      interactionScore: 25,
      cleaningScore: 0,
      moderationScore: 0,
      securityScore: 0,
      recruiterScore: 0,
      likabilityScore: 0,
      legacyContributionScore: 0,
    },
    streakDays: 4,
    lastActiveOffsetHours: -3,
    manualRoles: ['user'],
    expectedRoles: ['user'],
    expectedTrustLevel: 'regular',
    scenario: 'Membership-only participant: joins SubFeeds but never publishes into them.',
  },
  {
    key: 'soren',
    email: 'soren@example.com',
    username: 'soren',
    password: 'password123',
    bio: 'Indie web tinkerer in Bergen. I run a tiny static site, self-host my feeds, and collect notes on Postgres, queues and boring infrastructure.',
    language: 'en',
    interests: ['indie web', 'Postgres', 'self-hosting'],
    scores: {
      discoveryScore: 70,
      contributionScore: 200,
      interactionScore: 40,
      cleaningScore: 0,
      moderationScore: 0,
      securityScore: 0,
      recruiterScore: 0,
      likabilityScore: 0,
      legacyContributionScore: 0,
    },
    streakDays: 9,
    lastActiveOffsetHours: -1,
    manualRoles: ['user'],
    expectedRoles: ['recruiter', 'uploader', 'user'],
    expectedTrustLevel: 'trusted',
    scenario: 'Owner of nordic-indie-web and a site-wide uploader.',
  },
  {
    key: 'linnea',
    email: 'linnea@example.com',
    username: 'linnea',
    password: 'password123',
    bio: 'Frontend developer in Uppsala. I write about feed readers, webrings, and keeping personal sites small and fast.',
    language: 'en',
    interests: ['feed readers', 'webrings', 'performance'],
    scores: {
      discoveryScore: 0,
      contributionScore: 30,
      interactionScore: 20,
      cleaningScore: 0,
      moderationScore: 0,
      securityScore: 0,
      recruiterScore: 0,
      likabilityScore: 0,
      legacyContributionScore: 0,
    },
    streakDays: 3,
    lastActiveOffsetHours: -5,
    manualRoles: ['user'],
    expectedRoles: ['user'],
    expectedTrustLevel: 'regular',
    scenario: 'Local uploader in nordic-indie-web only, with no site-wide publishing role.',
  },
  {
    key: 'henrik',
    email: 'henrik@example.com',
    username: 'henrik',
    password: 'password123',
    bio: 'Design systems lead in Copenhagen. Obsessed with spacing scales, focus rings and documentation that engineers actually read.',
    language: 'en',
    interests: ['design systems', 'component APIs', 'documentation'],
    scores: {
      discoveryScore: 65,
      contributionScore: 130,
      interactionScore: 50,
      cleaningScore: 0,
      moderationScore: 0,
      securityScore: 0,
      recruiterScore: 0,
      likabilityScore: 0,
      legacyContributionScore: 0,
    },
    streakDays: 7,
    lastActiveOffsetHours: -2,
    manualRoles: ['user'],
    expectedRoles: ['recruiter', 'uploader', 'user'],
    expectedTrustLevel: 'trusted',
    scenario: 'Owner of craft-design-systems and local editor in nordic-indie-web.',
  },
  {
    key: 'freja',
    email: 'freja@example.com',
    username: 'freja',
    password: 'password123',
    bio: 'Editor and writer in Stockholm. I follow the Nordic web, applied AI and the craft of shipping calm software.',
    language: 'en',
    interests: ['editorial', 'Nordic web', 'applied AI'],
    scores: {
      discoveryScore: 95,
      contributionScore: 300,
      interactionScore: 110,
      cleaningScore: 0,
      moderationScore: 0,
      securityScore: 0,
      recruiterScore: 0,
      likabilityScore: 0,
      legacyContributionScore: 0,
    },
    streakDays: 21,
    lastActiveOffsetHours: -1,
    manualRoles: ['user'],
    expectedRoles: ['editor', 'recruiter', 'uploader', 'user'],
    expectedTrustLevel: 'veteran',
    scenario: 'Site-wide editor who publishes to the Main Feed and owns applied-ai-notes.',
  },
  {
    key: 'kalle',
    email: 'kalle@example.com',
    username: 'kalle',
    password: 'password123',
    bio: 'Moderator. I keep conversations useful: no spam, no pile-ons. Background in community support and trust and safety.',
    language: 'en',
    interests: ['moderation', 'trust and safety', 'community health'],
    scores: {
      discoveryScore: 0,
      contributionScore: 160,
      interactionScore: 90,
      cleaningScore: 120,
      moderationScore: 120,
      securityScore: 60,
      recruiterScore: 0,
      likabilityScore: 0,
      legacyContributionScore: 0,
    },
    streakDays: 16,
    lastActiveOffsetHours: -4,
    manualRoles: ['user'],
    expectedRoles: ['cleaner', 'moderator', 'recruiter', 'uploader', 'user'],
    expectedTrustLevel: 'trusted',
    scenario: 'Site moderator and cleaner who reviews the seeded reports.',
  },
  {
    key: 'alva',
    email: 'alva@example.com',
    username: 'alva',
    password: 'password123',
    bio: 'Administrator. I look after community health, archives and the slow work of keeping a small platform humane.',
    language: 'en',
    interests: ['community health', 'archives', 'governance'],
    scores: {
      discoveryScore: 220,
      contributionScore: 320,
      interactionScore: 240,
      cleaningScore: 180,
      moderationScore: 180,
      securityScore: 120,
      recruiterScore: 0,
      likabilityScore: 0,
      legacyContributionScore: 0,
    },
    streakDays: 45,
    lastActiveOffsetHours: -2,
    manualRoles: ['admin'],
    expectedRoles: ['admin', 'cleaner', 'editor', 'moderator', 'recruiter', 'uploader', 'user'],
    expectedTrustLevel: 'curator',
    scenario: 'Site administrator who applies quarantine and reviews escalated reports.',
  },
] as const satisfies readonly SeedPersona[]

/* -------------------------------------------------------------------------- */
/* SubFeeds                                                                   */
/* -------------------------------------------------------------------------- */

export const SEED_SUBFEEDS: readonly SeedSubfeed[] = [
  {
    key: 'nordic-indie-web',
    name: 'Nordic Indie Web',
    description:
      'Small personal sites, feed readers, webrings and the quiet craft of publishing on the open web. A corner for Nordic tinkerers who prefer hand-built pages to platforms.',
    rules:
      'Share work you made or used. Keep self-promotion rare and honest. Ask before posting the work of others. No growth-hacking threads.',
    theme: 'minimal',
    featured: true,
    owner: 'soren',
    moderators: ['soren'],
    editors: ['henrik'],
    uploaders: ['linnea'],
    members: ['soren', 'henrik', 'linnea', 'malin'],
  },
  {
    key: 'craft-design-systems',
    name: 'Craft & Design Systems',
    description:
      'Design tokens, component APIs, spacing scales and documentation that survives contact with real teams. Practical critique over screenshot theatre.',
    rules:
      'Bring implementation details and alternatives when you critique. Credit the team behind the work. No recruiting posts.',
    theme: 'craft',
    featured: true,
    owner: 'henrik',
    moderators: ['henrik'],
    editors: [],
    uploaders: [],
    members: ['henrik', 'malin', 'freja'],
  },
  {
    key: 'applied-ai-notes',
    name: 'Applied AI Notes',
    description:
      'Field notes on shipping AI-assisted features: evaluation, latency budgets, failure modes and the unglamorous work of keeping them useful.',
    rules:
      'Lead with evidence and user outcomes. Label speculation. No model-release hype threads.',
    theme: 'research',
    featured: false,
    owner: 'freja',
    moderators: ['freja'],
    editors: [],
    uploaders: ['soren'],
    members: ['freja', 'soren'],
  },
]

/* -------------------------------------------------------------------------- */
/* Content scenarios                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The plan enumerates 18 named scenarios under a "12 Links + 10 Posts" heading.
 * The keys below are the 18 named records (10 links, 8 posts); adding the two
 * remaining posts later must keep every existing key stable.
 */
export const SEED_CONTENT_SCENARIOS = [
  {
    key: 'astrid-personal-rss-setup',
    kind: 'link',
    author: 'astrid',
    destination: { feed: 'user' },
    expectation: 'personal-unpromoted',
    referenceNowOffsetHours: -52,
    type: 'article',
    title: 'Replacing my feed reader with forty lines of RSS',
    url: 'https://astrid.example/notes/rss-script',
    description:
      'I cancelled a subscription reader and rebuilt the part I actually use. The script fetches feeds, prints new entries and writes a small JSON file, and the plain XML still wins.',
    tags: ['rss', 'small-tools', 'local-first'],
    summary: 'Newcomer link about replacing a hosted feed reader with a small RSS script.',
  },
  {
    key: 'astrid-sqlite-backup-notes',
    kind: 'link',
    author: 'astrid',
    destination: { feed: 'user' },
    expectation: 'personal-promoted',
    referenceNowOffsetHours: -11,
    type: 'article',
    title: 'A boring SQLite backup routine that survived a bad week',
    url: 'https://astrid.example/notes/sqlite-backups',
    description:
      'Two copies, one command and a restore test on the first of every month. The routine is dull on purpose, which is why it kept working when my laptop did not.',
    tags: ['sqlite', 'backups', 'local-first'],
    summary: 'Personal link that earns enough support to surface in the Main Feed.',
  },
  {
    key: 'astrid-first-week-shipping-notes',
    kind: 'post',
    author: 'astrid',
    destination: { feed: 'user' },
    expectation: 'personal-unpromoted',
    referenceNowOffsetHours: -28,
    type: 'discussion',
    title: 'First week shipping in public: what I underestimated',
    body: [
      'I published three small things this week: a feed script, a backup note and a bug fix in a library I use every day. None of them were impressive, and all of them taught me something the tutorials skip.',
      'The hard part was not writing code. It was deciding what was small enough to finish after work, then resisting the urge to add one more feature before sharing it.',
      'My plan for next week is one note and one patch, both shipped before I read the replies. If you are also new here, that pace feels about right.',
    ],
    tags: ['newcomer', 'shipping', 'notes'],
    summary: 'Quiet first-week notes from a newcomer, unpromoted.',
  },
  {
    key: 'astrid-self-hosted-analytics-tradeoffs',
    kind: 'post',
    author: 'astrid',
    destination: { feed: 'user' },
    expectation: 'personal-promoted',
    referenceNowOffsetHours: -9,
    type: 'article',
    title: 'Self-hosted analytics: the trade-offs I did not expect',
    body: [
      'I moved a tiny site from a hosted analytics snippet to a self-hosted counter. The privacy win is real, but so is the maintenance: upgrades, log rotation and a dashboard nobody else can read.',
      'Hosted tools hide a lot of decisions. Self-hosting makes them visible, which is good if you want to learn and bad if you just want a number.',
      'For now I am keeping the self-hosted version for the notes site and leaving the rest alone. Boring choices are allowed.',
    ],
    tags: ['analytics', 'self-hosting', 'privacy'],
    summary: 'Promoted personal post weighing self-hosted analytics against hosted tools.',
  },
  {
    key: 'malin-accessibility-audit-checklist',
    kind: 'link',
    author: 'malin',
    destination: { feed: 'user' },
    expectation: 'personal-unpromoted',
    referenceNowOffsetHours: -44,
    type: 'article',
    title: 'The accessibility audit checklist I actually use',
    url: 'https://malin.example/writing/audit-checklist',
    description:
      'A one-page checklist covering keyboard order, focus visibility, contrast tokens, zoom and error recovery. It is written for teams shipping weekly, not for audit season.',
    tags: ['accessibility', 'audit', 'design-systems'],
    summary: 'Membership-only participant shares an audit checklist, never a SubFeed item.',
  },
  {
    key: 'malin-why-contrast-tokens-drift',
    kind: 'post',
    author: 'malin',
    destination: { feed: 'user' },
    expectation: 'personal-unpromoted',
    referenceNowOffsetHours: -30,
    type: 'article',
    title: 'Why contrast tokens drift (and how to catch it early)',
    body: [
      'Contrast tokens drift because the token is correct and the override is convenient. One raw hex value in a feature branch becomes the new normal two releases later.',
      'We now check three things in review: raw colour values, disabled states and focus rings on tinted backgrounds. The list is short enough that people actually use it.',
      'The fix is rarely a new token. Usually it is deleting an override and letting the semantic layer do its job.',
    ],
    tags: ['accessibility', 'design-tokens', 'review'],
    summary: 'Personal post about contrast token drift in day-to-day product work.',
  },
  {
    key: 'linnea-static-feed-reader-benchmarks',
    kind: 'link',
    author: 'linnea',
    destination: { feed: 'subfeed', subfeed: 'nordic-indie-web' },
    expectation: 'local-subfeed-unpromoted',
    referenceNowOffsetHours: -26,
    type: 'article',
    title: 'Benchmarks: five static feed readers on a slow laptop',
    url: 'https://linnea.example/lab/feed-reader-benchmarks',
    description:
      'Parse time, memory after a two-hundred-feed refresh and how each reader handles broken XML. The fastest parser was not the one I wanted to use.',
    tags: ['feed-readers', 'performance', 'indie-web'],
    summary: 'Local uploader link benchmarking static feed readers inside nordic-indie-web.',
  },
  {
    key: 'linnea-lessons-from-building-a-webring',
    kind: 'post',
    author: 'linnea',
    destination: { feed: 'subfeed', subfeed: 'nordic-indie-web' },
    expectation: 'local-subfeed-promoted',
    referenceNowOffsetHours: -10,
    type: 'article',
    title: 'Lessons from building a webring for six small sites',
    body: [
      'Six small sites, one shared page and no central feed reader. The webring is deliberately low-tech: a JSON file, a static build and a link at the bottom of each site.',
      'The social part was harder than the code. People wanted different ordering rules, and two sites had already stopped publishing. We settled on alphabetical rotation and a manual pause flag.',
      'What surprised me is how much traffic a small ring still sends. Not enough to matter to a business, but enough to remind each other that the sites exist.',
    ],
    tags: ['webring', 'indie-web', 'community'],
    summary: 'Local SubFeed post about running a small webring, promoted to the Main Feed.',
  },
  {
    key: 'soren-minimal-postgres-queue-patterns',
    kind: 'link',
    author: 'soren',
    destination: { feed: 'subfeed', subfeed: 'nordic-indie-web' },
    expectation: 'local-subfeed-promoted',
    referenceNowOffsetHours: -12,
    type: 'article',
    title: 'A minimal Postgres queue that has not needed a rewrite',
    url: 'https://soren.example/notes/postgres-queue',
    description:
      'SKIP LOCKED, one retry column and a scheduled vacuum. Three years of small jobs without adding another service to the stack.',
    tags: ['postgres', 'queues', 'infrastructure'],
    summary: 'Owner-authored SubFeed link on a minimal Postgres queue, promoted to the Main Feed.',
  },
  {
    key: 'soren-local-embedding-latency-notes',
    kind: 'post',
    author: 'soren',
    destination: { feed: 'subfeed', subfeed: 'applied-ai-notes' },
    expectation: 'local-subfeed-unpromoted',
    referenceNowOffsetHours: -16,
    type: 'discussion',
    title: 'Local embedding latency: notes from a week of profiling',
    body: [
      'I spent a week profiling local embeddings for a search side project. The model was not the bottleneck; tokenisation and the first cold start were.',
      'Batching helped until requests became interactive. After that, the useful change was capping input length and accepting worse recall for the first version.',
      'I still do not have a general answer, but I have a smaller surface area to measure. Happy to compare notes with anyone running something similar.',
    ],
    tags: ['embeddings', 'latency', 'profiling'],
    summary: 'Uploader post in applied-ai-notes about local embedding latency budgets.',
  },
  {
    key: 'henrik-subgrid-card-rhythm-guide',
    kind: 'link',
    author: 'henrik',
    destination: { feed: 'subfeed', subfeed: 'craft-design-systems' },
    expectation: 'local-subfeed-promoted',
    referenceNowOffsetHours: -12,
    type: 'article',
    title: 'Card rhythm: spacing scales that survive real content',
    url: 'https://henrik.example/design-systems/card-rhythm',
    description:
      'How we moved from arbitrary margins to a four-step rhythm, and the audit that showed us where the grid had been lying about alignment.',
    tags: ['design-systems', 'spacing', 'components'],
    summary: 'Owner-authored design systems link promoted from craft-design-systems to Main.',
  },
  {
    key: 'henrik-focus-ring-ergonomics',
    kind: 'post',
    author: 'henrik',
    destination: { feed: 'subfeed', subfeed: 'craft-design-systems' },
    expectation: 'local-subfeed-unpromoted',
    referenceNowOffsetHours: -14,
    type: 'article',
    title: 'Focus ring ergonomics: visible without shouting',
    body: [
      'A focus ring has one job: show where the keyboard is. The arguments start when teams try to make it match the brand.',
      'We use a two-layer ring now, a dark outline plus a light halo, so it survives both pale and dark surfaces. It is visible at a glance without becoming the loudest thing on the page.',
      'The audit rule is simple: tab through the page at 200 percent zoom and see if you ever lose your place. If you do, the ring is not the problem yet.',
    ],
    tags: ['accessibility', 'focus', 'design-systems'],
    summary: 'Unpromoted local post on focus ring ergonomics.',
  },
  {
    key: 'freja-v4-spring-architecture-digest',
    kind: 'link',
    author: 'freja',
    destination: { feed: 'main' },
    expectation: 'main-editorial',
    referenceNowOffsetHours: -8,
    editorialPriorityOffsetHours: 24,
    type: 'article',
    title: 'Spring architecture digest: the quiet changes worth reading',
    url: 'https://freja.example/editorial/spring-architecture',
    description:
      'Five architecture notes from the Nordic web this spring, selected for teams that maintain systems longer than they launch them.',
    tags: ['editorial', 'architecture', 'nordic-web'],
    summary: 'Site editor link with active editorial priority on the Main Feed.',
  },
  {
    key: 'freja-editorial-roadmap-personal-feeds',
    kind: 'post',
    author: 'freja',
    destination: { feed: 'main' },
    expectation: 'main-editorial',
    referenceNowOffsetHours: -7,
    editorialPriorityOffsetHours: 24,
    type: 'article',
    title: 'Editorial roadmap: making room for personal feeds',
    body: [
      'The editorial calendar has always assumed a small number of publishers. Personal feeds change that assumption: most good writing now starts in one person’s feed and only sometimes travels further.',
      'This quarter we are reserving space for personal items that earn their way into the Main Feed, and we are labelling the origin clearly when they do.',
      'The goal is not to flatten everything into one stream. It is to make the path from a personal note to a wider readership visible and honest.',
    ],
    tags: ['editorial', 'personal-feeds', 'community'],
    summary: 'Site editor post with active editorial priority on the Main Feed.',
  },
  {
    key: 'alva-archive-protocol-retrospective',
    kind: 'link',
    author: 'alva',
    destination: { feed: 'main' },
    expectation: 'main-editorial',
    referenceNowOffsetHours: -48,
    editorialPriorityOffsetHours: -6,
    type: 'article',
    title: 'What we learned retiring an archive protocol',
    url: 'https://alva.example/community/archive-protocol',
    description:
      'A retrospective on moving old threads to a slower store: what broke, what we kept and why the migration took two quarters instead of two sprints.',
    tags: ['archives', 'community', 'operations'],
    summary: 'Admin link whose editorial priority has expired, kept as a contrast case.',
  },
  {
    key: 'malin-draft-vendor-comparison-pending',
    kind: 'post',
    author: 'malin',
    destination: { feed: 'user' },
    expectation: 'pending',
    referenceNowOffsetHours: -2,
    type: 'article',
    title: 'Vendor comparison: three accessibility scanners, one afternoon',
    body: [
      'I compared three accessibility scanners on the same five pages. All three found the missing labels; none agreed on contrast failures.',
      'The useful output was not a score. It was the list of issues each tool could explain well enough for a developer to fix.',
      'This is still a draft because I want to re-run the pages after the next release. Sharing it once the numbers settle.',
    ],
    tags: ['accessibility', 'tooling', 'draft'],
    summary: 'Pending personal post, visible only to its author and moderators.',
  },
  {
    key: 'soren-disputed-benchmark-mirror',
    kind: 'link',
    author: 'soren',
    destination: { feed: 'user' },
    expectation: 'quarantined',
    referenceNowOffsetHours: -60,
    type: 'article',
    title: 'Mirror: the benchmark everyone keeps citing',
    url: 'https://mirror.example/benchmarks/queue-throughput',
    description:
      'A copy of a disputed queue benchmark, kept here for reference while the original authors review their numbers.',
    tags: ['benchmarks', 'postgres', 'reference'],
    summary: 'Personal link quarantined by an admin, excluded from public reads and promotion.',
  },
  {
    key: 'henrik-tabs-vs-spaces-css-reset',
    kind: 'link',
    author: 'henrik',
    destination: { feed: 'subfeed', subfeed: 'craft-design-systems' },
    expectation: 'controversial',
    referenceNowOffsetHours: -6,
    type: 'article',
    title: 'Tabs, spaces and the CSS reset nobody asked for',
    url: 'https://henrik.example/notes/tabs-spaces-reset',
    description:
      'A formatting debate dressed up as a reset debate. I think the reset is the smaller problem, but the comments disagree.',
    tags: ['css', 'formatting', 'design-systems'],
    summary: 'Balanced upvote/downvote SubFeed link that must not be promoted to Main.',
  },
] as const satisfies readonly SeedContentScenario[]

export type ContentScenarioKey = (typeof SEED_CONTENT_SCENARIOS)[number]['key']

/* -------------------------------------------------------------------------- */
/* Interaction scenarios                                                      */
/* -------------------------------------------------------------------------- */

export const SEED_INTERACTION_SCENARIOS: readonly SeedInteractionScenario[] = [
  {
    key: 'comment:astrid-personal-rss-setup:soren',
    kind: 'comment',
    actor: 'soren',
    target: 'astrid-personal-rss-setup',
    referenceNowOffsetHours: -46,
    text: 'This is the right amount of tool for the job. One thing that saved me: log the feed URL when parsing fails, not just the parser error.',
    note: 'Soren suggests logging the failing feed URL, not just the parser error.',
  },
  {
    key: 'comment:astrid-personal-rss-setup:astrid',
    kind: 'comment',
    actor: 'astrid',
    target: 'astrid-personal-rss-setup',
    parentKey: 'comment:astrid-personal-rss-setup:soren',
    referenceNowOffsetHours: -44,
    text: 'That is exactly the bug I hit last night. Adding the URL to the log line now, thank you.',
    note: 'Astrid replies that the suggestion matches a bug she hit the same night.',
  },
  {
    key: 'comment:astrid-sqlite-backup-notes:henrik',
    kind: 'comment',
    actor: 'henrik',
    target: 'astrid-sqlite-backup-notes',
    referenceNowOffsetHours: -30,
    text: 'The VACUUM INTO step is a nice touch. Do you keep the snapshots on disk or ship them somewhere else?',
    note: 'Henrik asks whether snapshots stay local or leave the machine.',
  },
  {
    key: 'comment:astrid-sqlite-backup-notes:astrid',
    kind: 'comment',
    actor: 'astrid',
    target: 'astrid-sqlite-backup-notes',
    parentKey: 'comment:astrid-sqlite-backup-notes:henrik',
    referenceNowOffsetHours: -29,
    text: 'One local copy and one off-site copy each week. Anything more and I stop doing it.',
    note: 'Astrid explains the one local plus one weekly off-site copy rule.',
  },
  {
    key: 'comment:linnea-static-feed-reader-benchmarks:henrik',
    kind: 'comment',
    actor: 'henrik',
    target: 'linnea-static-feed-reader-benchmarks',
    referenceNowOffsetHours: -22,
    text: 'The parse-time table is useful, but I would like to see memory after a two-hundred-feed refresh too.',
    note: 'Henrik asks for memory after a large refresh, not just parse time.',
  },
  {
    key: 'comment:soren-minimal-postgres-queue-patterns:kalle',
    kind: 'comment',
    actor: 'kalle',
    target: 'soren-minimal-postgres-queue-patterns',
    referenceNowOffsetHours: -10,
    text: 'Skipping the queue service is underrated. Do you track retries per job or per batch?',
    note: 'Kalle asks whether retries are tracked per job or per batch.',
  },
  {
    key: 'comment:soren-minimal-postgres-queue-patterns:soren',
    kind: 'comment',
    actor: 'soren',
    target: 'soren-minimal-postgres-queue-patterns',
    parentKey: 'comment:soren-minimal-postgres-queue-patterns:kalle',
    referenceNowOffsetHours: -9,
    text: 'Per job, with a small backoff column. Retrying a batch made failures impossible to reason about.',
    note: 'Soren explains per-job retries with a small backoff column.',
  },
  {
    key: 'comment:henrik-subgrid-card-rhythm-guide:malin',
    kind: 'comment',
    actor: 'malin',
    target: 'henrik-subgrid-card-rhythm-guide',
    referenceNowOffsetHours: -11,
    text: 'The card rhythm section explained why our grid felt noisy at 1440px. Saving this for the next audit.',
    note: 'Malin connects the card rhythm section to a real audit finding.',
  },
  {
    key: 'comment:malin-why-contrast-tokens-drift:linnea',
    kind: 'comment',
    actor: 'linnea',
    target: 'malin-why-contrast-tokens-drift',
    referenceNowOffsetHours: -24,
    text: 'The drift usually starts with a one-off override. We now grep for raw hex in review and it caught three last week.',
    note: 'Linnea shares a review habit that catches raw hex overrides.',
  },
  {
    key: 'comment:henrik-tabs-vs-spaces-css-reset:freja',
    kind: 'comment',
    actor: 'freja',
    target: 'henrik-tabs-vs-spaces-css-reset',
    referenceNowOffsetHours: -4,
    text: 'A reset is not a formatting standard. What would a smaller intervention look like?',
    note: 'Freja pushes back on conflating a reset with a formatting standard.',
  },
  {
    key: 'comment:henrik-tabs-vs-spaces-css-reset:kalle',
    kind: 'comment',
    actor: 'kalle',
    target: 'henrik-tabs-vs-spaces-css-reset',
    referenceNowOffsetHours: -3,
    text: 'Keep this one about the reset, not about the people who wrote it.',
    note: 'Kalle redirects the thread away from personal attacks.',
  },
  {
    key: 'vote:alva:astrid-sqlite-backup-notes',
    kind: 'vote',
    actor: 'alva',
    target: 'astrid-sqlite-backup-notes',
    value: 'up',
    referenceNowOffsetHours: -10,
    note: 'Admin support for the promoted personal link.',
  },
  {
    key: 'vote:soren:astrid-sqlite-backup-notes',
    kind: 'vote',
    actor: 'soren',
    target: 'astrid-sqlite-backup-notes',
    value: 'up',
    referenceNowOffsetHours: -10,
    note: 'Peer support for the promoted personal link.',
  },
  {
    key: 'vote:henrik:astrid-sqlite-backup-notes',
    kind: 'vote',
    actor: 'henrik',
    target: 'astrid-sqlite-backup-notes',
    value: 'up',
    referenceNowOffsetHours: -9,
    note: 'Peer support for the promoted personal link.',
  },
  {
    key: 'vote:freja:astrid-sqlite-backup-notes',
    kind: 'vote',
    actor: 'freja',
    target: 'astrid-sqlite-backup-notes',
    value: 'up',
    referenceNowOffsetHours: -9,
    note: 'Editorial support for the promoted personal link.',
  },
  {
    key: 'vote:kalle:astrid-sqlite-backup-notes',
    kind: 'vote',
    actor: 'kalle',
    target: 'astrid-sqlite-backup-notes',
    value: 'up',
    referenceNowOffsetHours: -8,
    note: 'Moderator support for the promoted personal link.',
  },
  {
    key: 'vote:soren:astrid-personal-rss-setup',
    kind: 'vote',
    actor: 'soren',
    target: 'astrid-personal-rss-setup',
    value: 'up',
    referenceNowOffsetHours: -45,
    note: 'Small support that stays below the promotion threshold.',
  },
  {
    key: 'vote:linnea:astrid-personal-rss-setup',
    kind: 'vote',
    actor: 'linnea',
    target: 'astrid-personal-rss-setup',
    value: 'up',
    referenceNowOffsetHours: -44,
    note: 'Second small support that stays below the promotion threshold.',
  },
  {
    key: 'vote:henrik:malin-accessibility-audit-checklist',
    kind: 'vote',
    actor: 'henrik',
    target: 'malin-accessibility-audit-checklist',
    value: 'up',
    referenceNowOffsetHours: -40,
    note: 'Design systems peer votes on the accessibility checklist.',
  },
  {
    key: 'vote:linnea:malin-accessibility-audit-checklist',
    kind: 'vote',
    actor: 'linnea',
    target: 'malin-accessibility-audit-checklist',
    value: 'up',
    referenceNowOffsetHours: -39,
    note: 'Frontend peer votes on the accessibility checklist.',
  },
  {
    key: 'vote:soren:linnea-static-feed-reader-benchmarks',
    kind: 'vote',
    actor: 'soren',
    target: 'linnea-static-feed-reader-benchmarks',
    value: 'up',
    referenceNowOffsetHours: -21,
    note: 'SubFeed owner supports the local benchmark link.',
  },
  {
    key: 'vote:freja:soren-minimal-postgres-queue-patterns',
    kind: 'vote',
    actor: 'freja',
    target: 'soren-minimal-postgres-queue-patterns',
    value: 'up',
    referenceNowOffsetHours: -11,
    note: 'Editorial support for the promoted SubFeed link.',
  },
  {
    key: 'vote:kalle:soren-minimal-postgres-queue-patterns',
    kind: 'vote',
    actor: 'kalle',
    target: 'soren-minimal-postgres-queue-patterns',
    value: 'up',
    referenceNowOffsetHours: -11,
    note: 'Moderator support for the promoted SubFeed link.',
  },
  {
    key: 'vote:henrik:soren-minimal-postgres-queue-patterns',
    kind: 'vote',
    actor: 'henrik',
    target: 'soren-minimal-postgres-queue-patterns',
    value: 'up',
    referenceNowOffsetHours: -10,
    note: 'Peer support for the promoted SubFeed link.',
  },
  {
    key: 'vote:alva:soren-minimal-postgres-queue-patterns',
    kind: 'vote',
    actor: 'alva',
    target: 'soren-minimal-postgres-queue-patterns',
    value: 'up',
    referenceNowOffsetHours: -10,
    note: 'Admin support for the promoted SubFeed link.',
  },
  {
    key: 'vote:malin:henrik-subgrid-card-rhythm-guide',
    kind: 'vote',
    actor: 'malin',
    target: 'henrik-subgrid-card-rhythm-guide',
    value: 'up',
    referenceNowOffsetHours: -12,
    note: 'Membership-only participant can still vote on a promoted SubFeed link.',
  },
  {
    key: 'vote:freja:henrik-subgrid-card-rhythm-guide',
    kind: 'vote',
    actor: 'freja',
    target: 'henrik-subgrid-card-rhythm-guide',
    value: 'up',
    referenceNowOffsetHours: -12,
    note: 'Editorial support for the promoted SubFeed link.',
  },
  {
    key: 'vote:soren:henrik-subgrid-card-rhythm-guide',
    kind: 'vote',
    actor: 'soren',
    target: 'henrik-subgrid-card-rhythm-guide',
    value: 'up',
    referenceNowOffsetHours: -11,
    note: 'Peer support for the promoted SubFeed link.',
  },
  {
    key: 'vote:alva:freja-v4-spring-architecture-digest',
    kind: 'vote',
    actor: 'alva',
    target: 'freja-v4-spring-architecture-digest',
    value: 'up',
    referenceNowOffsetHours: -7,
    note: 'Admin support for the active editorial link.',
  },
  {
    key: 'vote:soren:freja-v4-spring-architecture-digest',
    kind: 'vote',
    actor: 'soren',
    target: 'freja-v4-spring-architecture-digest',
    value: 'up',
    referenceNowOffsetHours: -6,
    note: 'Community support for the active editorial link.',
  },
  {
    key: 'vote:freja:alva-archive-protocol-retrospective',
    kind: 'vote',
    actor: 'freja',
    target: 'alva-archive-protocol-retrospective',
    value: 'up',
    referenceNowOffsetHours: -40,
    note: 'Editorial support that does not extend the expired priority.',
  },
  {
    key: 'vote:soren:henrik-tabs-vs-spaces-css-reset',
    kind: 'vote',
    actor: 'soren',
    target: 'henrik-tabs-vs-spaces-css-reset',
    value: 'up',
    referenceNowOffsetHours: -5,
    note: 'Upvote on the controversial fixture.',
  },
  {
    key: 'vote:malin:henrik-tabs-vs-spaces-css-reset',
    kind: 'vote',
    actor: 'malin',
    target: 'henrik-tabs-vs-spaces-css-reset',
    value: 'up',
    referenceNowOffsetHours: -5,
    note: 'Second upvote on the controversial fixture.',
  },
  {
    key: 'vote:linnea:henrik-tabs-vs-spaces-css-reset',
    kind: 'vote',
    actor: 'linnea',
    target: 'henrik-tabs-vs-spaces-css-reset',
    value: 'down',
    referenceNowOffsetHours: -4,
    note: 'Downvote keeping the controversial fixture balanced.',
  },
  {
    key: 'vote:alva:henrik-tabs-vs-spaces-css-reset',
    kind: 'vote',
    actor: 'alva',
    target: 'henrik-tabs-vs-spaces-css-reset',
    value: 'down',
    referenceNowOffsetHours: -3,
    note: 'Second downvote keeping the controversial fixture balanced.',
  },
  {
    key: 'vote:kalle:soren-disputed-benchmark-mirror',
    kind: 'vote',
    actor: 'kalle',
    target: 'soren-disputed-benchmark-mirror',
    value: 'down',
    referenceNowOffsetHours: -55,
    note: 'Moderator downvotes the quarantined mirror before quarantine.',
  },
  {
    key: 'vote:freja:soren-disputed-benchmark-mirror',
    kind: 'vote',
    actor: 'freja',
    target: 'soren-disputed-benchmark-mirror',
    value: 'down',
    referenceNowOffsetHours: -54,
    note: 'Editor downvotes the quarantined mirror before quarantine.',
  },
  {
    key: 'bookmark:malin:astrid-sqlite-backup-notes',
    kind: 'bookmark',
    actor: 'malin',
    target: 'astrid-sqlite-backup-notes',
    referenceNowOffsetHours: -10,
    note: 'Malin saves the promotion example as a reference.',
  },
  {
    key: 'bookmark:linnea:soren-minimal-postgres-queue-patterns',
    kind: 'bookmark',
    actor: 'linnea',
    target: 'soren-minimal-postgres-queue-patterns',
    referenceNowOffsetHours: -11,
    note: 'Linnea bookmarks the queue pattern for later.',
  },
  {
    key: 'bookmark:henrik:astrid-personal-rss-setup',
    kind: 'bookmark',
    actor: 'henrik',
    target: 'astrid-personal-rss-setup',
    referenceNowOffsetHours: -43,
    note: 'Henrik bookmarks the newcomer feed setup.',
  },
  {
    key: 'bookmark:soren:freja-v4-spring-architecture-digest',
    kind: 'bookmark',
    actor: 'soren',
    target: 'freja-v4-spring-architecture-digest',
    referenceNowOffsetHours: -6,
    note: 'Soren saves the editorial digest.',
  },
  {
    key: 'bookmark:astrid:linnea-lessons-from-building-a-webring',
    kind: 'bookmark',
    actor: 'astrid',
    target: 'linnea-lessons-from-building-a-webring',
    referenceNowOffsetHours: -8,
    note: 'Astrid saves the webring post that inspired her.',
  },
  {
    key: 'discovery:soren:linnea-lessons-from-building-a-webring',
    kind: 'discovery',
    actor: 'soren',
    target: 'linnea-lessons-from-building-a-webring',
    referenceNowOffsetHours: -9,
    engagementGenerated: 12,
    note: 'Soren discovers the webring post while browsing the SubFeed.',
  },
  {
    key: 'discovery:henrik:astrid-self-hosted-analytics-tradeoffs',
    kind: 'discovery',
    actor: 'henrik',
    target: 'astrid-self-hosted-analytics-tradeoffs',
    referenceNowOffsetHours: -8,
    engagementGenerated: 9,
    note: 'Henrik discovers the promoted personal post.',
  },
  {
    key: 'discovery:freja:linnea-lessons-from-building-a-webring',
    kind: 'discovery',
    actor: 'freja',
    target: 'linnea-lessons-from-building-a-webring',
    referenceNowOffsetHours: -10,
    engagementGenerated: 11,
    note: 'Freja discovers the webring post while curating the Main Feed.',
  },
  {
    key: 'discovery:malin:astrid-self-hosted-analytics-tradeoffs',
    kind: 'discovery',
    actor: 'malin',
    target: 'astrid-self-hosted-analytics-tradeoffs',
    referenceNowOffsetHours: -8,
    engagementGenerated: 7,
    note: 'Malin discovers the personal analytics post from her feed.',
  },
  {
    key: 'report:linnea:henrik-tabs-vs-spaces-css-reset',
    kind: 'report',
    actor: 'linnea',
    target: 'henrik-tabs-vs-spaces-css-reset',
    reason: 'harassment',
    referenceNowOffsetHours: -2,
    details:
      'The thread is turning into personal attacks rather than a discussion of the reset. Flagging it for a moderator to look at.',
    note: 'A regular member flags the escalating thread for review.',
  },
  {
    key: 'report:astrid:soren-disputed-benchmark-mirror',
    kind: 'report',
    actor: 'astrid',
    target: 'soren-disputed-benchmark-mirror',
    reason: 'broken_link',
    referenceNowOffsetHours: -56,
    details:
      'The mirror link no longer resolves for me, and the surrounding numbers are disputed. Could a moderator check the source?',
    note: 'A newcomer reports the disputed benchmark mirror as a broken link.',
  },
]

/* -------------------------------------------------------------------------- */
/* Manifest                                                                   */
/* -------------------------------------------------------------------------- */

export const SEED_SCENARIO_MANIFEST = {
  personas: SEED_PERSONAS,
  subfeeds: SEED_SUBFEEDS,
  content: SEED_CONTENT_SCENARIOS,
  interactions: SEED_INTERACTION_SCENARIOS,
} as const

/* -------------------------------------------------------------------------- */
/* Seed helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Lexical rich text with one paragraph per string (or a single paragraph). */
export const asLexicalRichText = (text: string | readonly string[]) => {
  const paragraphs = typeof text === 'string' ? [text] : text

  return {
    root: {
      children: paragraphs.map((paragraph) => ({
        children: [
          {
            detail: 0 as const,
            format: 0 as const,
            mode: 'normal' as const,
            style: '',
            text: paragraph,
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
      })),
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      type: 'root' as const,
      version: 1 as const,
    },
  }
}

export const readRelationId = (value: unknown): number | null => {
  if (typeof value === 'number') return value

  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'number' ? id : null
  }

  return null
}

export const readRelationIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return []
  return value.map(readRelationId).filter((id): id is number => typeof id === 'number')
}

/** Scenario roles that must be eligible for Main Feed promotion. */
export const PROMOTED_EXPECTATIONS: ReadonlySet<ContentScenarioExpectation> = new Set([
  'personal-promoted',
  'local-subfeed-promoted',
])

export const getContentSignalProfile = (
  expectation: ContentScenarioExpectation,
): ContentSignalProfile => CONTENT_SIGNAL_PROFILES[expectation]
