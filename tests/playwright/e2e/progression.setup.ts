import { test as setup } from '@playwright/test'
import type { Browser } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

import { AuthPage } from './pages/AuthPage'

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

// ---------------------------------------------------------------------------
// Deterministic members. Signals are seeded (never roles — the standing engine
// re-derives roles on every users update).
//   * newcomer  -> no signals -> 'Newcomer', ineligible to create a Subfeed
//   * qualified -> contributionScore 200 -> 'Recognized' + uploader, eligible
//   * localmod  -> no signals -> site role 'user' (receives only a LOCAL role)
// Values and thresholds live in `src/lib/community/reputation.ts`; the policy
// itself is asserted in Vitest, so these fixtures only exist to prove the
// surfaces render.
// ---------------------------------------------------------------------------
const MEMBERS = [
  { key: 'newcomer', contributionScore: 0 },
  { key: 'qualified', contributionScore: 200 },
  { key: 'localmod', contributionScore: 0 },
]

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

  // The shared fixture module owns the Local API bootstrap and the shape of every
  // domain object; this adapter only supplies how to load the Payload config.
  const { findOrCreateMember, createSubfeedWithRoster, createFeedItem, createPayloadLoader } =
    await import('../../fixtures/community')

  const getTestPayload = createPayloadLoader(async () => {
    const { default: configPromise } = await import('@payload-config')
    return configPromise
  })

  const payload = await getTestPayload()

  // 1. Deterministic members (one login each, so unique identities).
  const members = await Promise.all(
    MEMBERS.map(async (member) =>
      findOrCreateMember(payload, {
        email: `e2e-${member.key}@v4.test`,
        username: `e2e-${member.key}`,
        password: E2E_PASSWORD,
        contributionScore: member.contributionScore,
      }),
    ),
  )
  const [newcomer, qualified, localmod] = members

  // 2. Admin, needed for the quarantine journey.
  const admin = await findOrCreateMember(payload, {
    email: process.env.EMAIL || 'admin@mail.com',
    username: 'admin',
    password: '1234',
    roles: ['admin', 'user'],
  })

  // 3. Subfeeds — one owned by the qualified member (local governance plus a
  //    qualifying Subfeed link), one owned by admin (for isolation assertions).
  const qualifiedSubfeed = await createSubfeedWithRoster(payload, {
    ownerId: qualified.id,
    prefix: 'e2e-qualified',
    name: 'E2E Qualified Subfeed',
    description: 'Deterministic E2E subfeed owned by the qualified member.',
    members: [qualified.id, localmod.id],
  })

  const adminSubfeed = await createSubfeedWithRoster(payload, {
    ownerId: admin.id,
    prefix: 'e2e-admin',
    name: 'E2E Admin Subfeed',
    description: 'Deterministic E2E subfeed owned by the admin.',
    members: [admin.id, localmod.id],
  })

  const moderatorSubfeed = await createSubfeedWithRoster(payload, {
    ownerId: qualified.id,
    prefix: 'e2e-moderator',
    name: 'E2E Moderator Subfeed',
    description: 'Independent fixture for local moderator permissions.',
    moderators: [qualified.id, localmod.id],
    members: [qualified.id, localmod.id],
  })

  // 4. Content fixtures. Only what a render assertion needs: the policy
  //    permutations (controversial, soft-deleted, expired priority) are asserted
  //    against the Promotion Gate in Vitest.
  const featuredUserFeed = await createFeedItem(payload, {
    collection: 'links',
    user: qualified.id,
    feed: 'user',
    state: 'published',
    titlePrefix: 'E2E Featured User Feed',
    signals: { featured: true },
  })

  const subfeedLink = await createFeedItem(payload, {
    collection: 'links',
    user: qualified.id,
    feed: 'subfeed',
    subfeedId: qualifiedSubfeed.id,
    state: 'published',
    titlePrefix: 'E2E Subfeed Link',
    signals: { featured: true },
  })

  const adminEditorial = await createFeedItem(payload, {
    collection: 'links',
    user: admin.id,
    feed: 'main',
    state: 'published',
    titlePrefix: 'E2E Admin Editorial',
  })

  const quarantineTarget = await createFeedItem(payload, {
    collection: 'links',
    user: qualified.id,
    feed: 'user',
    state: 'published',
    titlePrefix: 'E2E Quarantine Target',
    signals: { featured: true },
  })

  // 5. Deterministic handoff to the e2e spec.
  const fixture = {
    runId: Date.now(),
    users: {
      newcomer: { id: newcomer.id, username: newcomer.username, email: newcomer.email },
      qualified: { id: qualified.id, username: qualified.username, email: qualified.email },
      localmod: { id: localmod.id, username: localmod.username, email: localmod.email },
      admin: { id: admin.id, username: admin.username },
    },
    links: {
      featuredUserFeed: { id: featuredUserFeed.id, title: featuredUserFeed.title },
      subfeedLink: { id: subfeedLink.id, title: subfeedLink.title },
      adminEditorial: { id: adminEditorial.id, title: adminEditorial.title },
      quarantineTarget: { id: quarantineTarget.id, title: quarantineTarget.title },
    },
    subfeeds: {
      qualifiedSubfeed: {
        id: qualifiedSubfeed.id,
        slug: qualifiedSubfeed.slug,
        name: qualifiedSubfeed.name,
      },
      adminSubfeed: { id: adminSubfeed.id, slug: adminSubfeed.slug, name: adminSubfeed.name },
      moderatorSubfeed: {
        id: moderatorSubfeed.id,
        slug: moderatorSubfeed.slug,
        name: moderatorSubfeed.name,
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
