import { test as setup } from '@playwright/test'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import { AuthPage } from './pages/AuthPage'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import type { Browser } from '@playwright/test'

// The fixture bootstrap (Local API + several UI logins) is intentionally slow on
// first Next-dev compile, so raise the test-level timeout well above the default.
setup.setTimeout(300_000)

// Test overrides must be loaded before importing the database configuration.
dotenv.config()
dotenv.config({ path: path.resolve(process.cwd(), 'tests/test.env'), override: true })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const AUTH_DIR = path.join(__dirname, '..', '.auth')
const FIXTURE_DIR = path.join(__dirname, '.fixtures')
const FIXTURE_FILE = path.join(FIXTURE_DIR, 'progression.json')

const E2E_PASSWORD = 'password123'
const ADMIN_EMAIL = process.env.EMAIL || 'admin@mail.com'
const ADMIN_PASSWORD = '1234'

// ---------------------------------------------------------------------------
// Deterministic members. Signals are seeded (never roles — the standing engine
// re-derives roles on every users update). Thresholds from reputation.ts.
//   * newcomer  -> no signals -> 'Newcomer', ineligible
//   * qualified -> contributionScore 200 -> 'Recognized' + uploader, eligible
//   * editor    -> contributionScore 300 + interactionScore 100 -> 'Trusted' + editor
//   * localmod  -> no signals -> site role 'user' (receives only a LOCAL role later)
// ---------------------------------------------------------------------------
const MEMBERS = [
  {
    key: 'newcomer',
    email: 'e2e-newcomer@v4.test',
    username: 'e2e-newcomer',
    signals: {} as Record<string, number>,
  },
  {
    key: 'qualified',
    email: 'e2e-qualified@v4.test',
    username: 'e2e-qualified',
    signals: { contributionScore: 200 } as Record<string, number>,
  },
  {
    key: 'editor',
    email: 'e2e-editor@v4.test',
    username: 'e2e-editor',
    signals: { contributionScore: 300, interactionScore: 100 } as Record<string, number>,
  },
  {
    key: 'localmod',
    email: 'e2e-localmod@v4.test',
    username: 'e2e-localmod',
    signals: {} as Record<string, number>,
  },
]

// Promise-lock for getPayload (mirrors tests/vitest/utils/test-user.ts) so any
// concurrent setup file cannot double-initialise the Payload client.
let cachedPayload: Payload | null = null
let payloadInitPromise: Promise<Payload> | null = null

async function getTestPayload(): Promise<Payload> {
  if (cachedPayload) return cachedPayload
  if (payloadInitPromise) return payloadInitPromise

  payloadInitPromise = (async () => {
    const { default: configPromise } = await import('@payload-config')
    const cfg = await configPromise
    const initialized = await getPayload({ config: cfg })
    cachedPayload = initialized
    return initialized
  })()

  try {
    return await payloadInitPromise
  } finally {
    payloadInitPromise = null
  }
}

const baseSignals = () => ({
  discoveryScore: 0,
  contributionScore: 0,
  interactionScore: 0,
  likabilityScore: 0,
  cleaningScore: 0,
  recruiterScore: 0,
  moderationScore: 0,
  securityScore: 0,
  legacyContributionScore: 0,
  streakDays: 0,
  lastActiveAt: new Date().toISOString(),
})

async function findUserByEmail(payload: Payload, email: string) {
  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

async function upsertMember(
  payload: Payload,
  member: (typeof MEMBERS)[number],
): Promise<{ id: number; email: string; username: string }> {
  const existing = await findUserByEmail(payload, member.email)
  const data: any = {
    email: member.email,
    username: member.username,
    password: E2E_PASSWORD,
    ...baseSignals(),
    ...member.signals,
    settings: { nsfw: false, language: 'en' as const },
  }

  if (existing) {
    const updated = await payload.update({
      collection: 'users',
      id: existing.id,
      data,
      overrideAccess: true,
    })
    return { id: updated.id as number, email: member.email, username: member.username }
  }

  const created = await payload.create({
    collection: 'users',
    data,
    overrideAccess: true,
  })
  return { id: created.id as number, email: member.email, username: member.username }
}

async function resolveAdmin(payload: Payload): Promise<{ id: number; username: string }> {
  const existing = await findUserByEmail(payload, ADMIN_EMAIL)
  if (existing) {
    return { id: existing.id as number, username: existing.username as string }
  }

  const created = await payload.create({
    collection: 'users',
    data: {
      email: ADMIN_EMAIL,
      username: 'admin',
      password: ADMIN_PASSWORD,
      roles: ['admin', 'user'],
      ...baseSignals(),
      settings: { nsfw: false, language: 'en' as const },
    } as any,
    overrideAccess: true,
  })
  return { id: created.id as number, username: 'admin' }
}

async function createLink(payload: Payload, data: any) {
  const created = await payload.create({
    collection: 'links',
    data: { type: 'article', ...data, _status: 'published' },
    draft: false,
    overrideAccess: true,
  })
  return { id: created.id as number, title: created.title as string }
}

async function loginAndSave(browser: Browser, email: string, password: string, filename: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)
  const authPage = new AuthPage(page)

  await authPage.login(email, password)

  // After a successful login the app routes to home ('/'); the login page
  // ('/login') does not. Reuse the global.setup wait pattern with a generous
  // first-compile timeout.
  await page.waitForURL('**/', { timeout: 60_000, waitUntil: 'domcontentloaded' })
  await page.context().storageState({ path: filename })
  await context.close()
}

setup('prepare progression fixtures and per-role auth states', async ({ browser }) => {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true })
  if (!fs.existsSync(FIXTURE_DIR)) fs.mkdirSync(FIXTURE_DIR, { recursive: true })

  const payload = await getTestPayload()
  const runId = Date.now()
  const suffix = `${runId}`

  // 1. Deterministic members (idempotent upsert).
  const [newcomer, qualified, editor, localmod] = await Promise.all(
    MEMBERS.map((member) => upsertMember(payload, member)),
  )

  // 2. Admin.
  const admin = await resolveAdmin(payload)

  // 3. Subfeeds — one owned by the qualified member (for local governance + a
  //    qualifying subfeed link), one owned by admin (for isolation assertions).
  const qualifiedSubfeed = await payload.create({
    collection: 'subfeeds',
    data: {
      name: `E2E Qualified Subfeed ${suffix}`,
      slug: `e2e-qualified-subfeed-${suffix}`,
      description: 'Deterministic E2E subfeed owned by the qualified member.',
      owner: qualified.id,
      moderators: [qualified.id],
      editors: [],
      uploaders: [],
      members: [qualified.id, localmod.id],
    },
    overrideAccess: true,
  })

  const adminSubfeed = await payload.create({
    collection: 'subfeeds',
    data: {
      name: `E2E Admin Subfeed ${suffix}`,
      slug: `e2e-admin-subfeed-${suffix}`,
      description: 'Deterministic E2E subfeed owned by the admin.',
      owner: admin.id,
      moderators: [admin.id],
      editors: [],
      uploaders: [],
      members: [admin.id, localmod.id],
    },
    overrideAccess: true,
  })

  // 4. Content fixtures.
  const featuredUserFeed = await createLink(payload, {
    title: `E2E Featured User Feed ${suffix}`,
    url: `https://e2e.test/${suffix}/featured-user`,
    feed: 'user',
    user: qualified.id,
    featured: true,
  })

  const subfeedLink = await createLink(payload, {
    title: `E2E Subfeed Link ${suffix}`,
    url: `https://e2e.test/${suffix}/subfeed`,
    feed: 'subfeed',
    subfeed: qualifiedSubfeed.id,
    user: qualified.id,
    featured: true,
  })

  // Admin-authored main-feed link: editorial priority granted automatically.
  const adminEditorial = await createLink(payload, {
    title: `E2E Admin Editorial ${suffix}`,
    url: `https://e2e.test/${suffix}/admin-editorial`,
    feed: 'main',
    user: admin.id,
  })

  // Expired-priority main-feed link: create (granting priority), then push the
  // expiration timestamp into the past via an admin update.
  const expiredEditorial = await createLink(payload, {
    title: `E2E Expired Editorial ${suffix}`,
    url: `https://e2e.test/${suffix}/expired-editorial`,
    feed: 'main',
    user: admin.id,
  })
  await payload.update({
    collection: 'links',
    id: expiredEditorial.id,
    data: {
      editorialPriorityUntil: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    overrideAccess: true,
  })

  // Controversial featured user-feed link (balanced votes -> controversy).
  const controversial = await createLink(payload, {
    title: `E2E Controversial User Link ${suffix}`,
    url: `https://e2e.test/${suffix}/controversial`,
    feed: 'user',
    user: qualified.id,
    featured: true,
    upvotes: 5,
    downvotes: 5,
  })

  // Soft-deleted featured user-feed link.
  const softDeleted = await createLink(payload, {
    title: `E2E SoftDeleted User Link ${suffix}`,
    url: `https://e2e.test/${suffix}/soft-deleted`,
    feed: 'user',
    user: qualified.id,
    featured: true,
    softDeleted: true,
  })

  // Pre-quarantined featured user-feed link.
  const quarantined = await createLink(payload, {
    title: `E2E Quarantined User Link ${suffix}`,
    url: `https://e2e.test/${suffix}/quarantined`,
    feed: 'user',
    user: qualified.id,
    featured: true,
    quarantined: true,
  })

  // Normal featured user-feed link that the admin quarantines during the test.
  const quarantineTarget = await createLink(payload, {
    title: `E2E Quarantine Target ${suffix}`,
    url: `https://e2e.test/${suffix}/quarantine-target`,
    feed: 'user',
    user: qualified.id,
    featured: true,
  })

  // 5. Deterministic handoff to the e2e spec.
  const fixture = {
    runId,
    users: {
      newcomer,
      qualified,
      editor,
      localmod,
      admin: { id: admin.id, username: admin.username },
    },
    links: {
      featuredUserFeed: { id: featuredUserFeed.id, title: featuredUserFeed.title },
      subfeedLink: { id: subfeedLink.id, title: subfeedLink.title },
      adminEditorial: { id: adminEditorial.id, title: adminEditorial.title },
      expiredEditorial: { id: expiredEditorial.id, title: expiredEditorial.title },
      controversial: { id: controversial.id, title: controversial.title },
      softDeleted: { id: softDeleted.id, title: softDeleted.title },
      quarantined: { id: quarantined.id, title: quarantined.title },
      quarantineTarget: { id: quarantineTarget.id, title: quarantineTarget.title },
    },
    subfeeds: {
      qualifiedSubfeed: {
        id: qualifiedSubfeed.id as number,
        slug: qualifiedSubfeed.slug as string,
        name: qualifiedSubfeed.name as string,
      },
      adminSubfeed: {
        id: adminSubfeed.id as number,
        slug: adminSubfeed.slug as string,
        name: adminSubfeed.name as string,
      },
    },
  }

  fs.writeFileSync(FIXTURE_FILE, JSON.stringify(fixture, null, 2))

  // 6. Per-role auth states (admin storage state is produced by global.setup.ts).
  await loginAndSave(browser, newcomer.email, E2E_PASSWORD, path.join(AUTH_DIR, 'newcomer.json'))
  await loginAndSave(browser, qualified.email, E2E_PASSWORD, path.join(AUTH_DIR, 'qualified.json'))
  await loginAndSave(browser, localmod.email, E2E_PASSWORD, path.join(AUTH_DIR, 'localmod.json'))

  console.log(`[progression.setup] fixtures written to ${FIXTURE_FILE}`)
})
