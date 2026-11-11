import { test, expect } from '@playwright/test'
import type { Page, Locator } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_FILE = path.join(__dirname, '.fixtures', 'progression.json')
const AUTH = (name: string) => path.join(__dirname, '..', '.auth', `${name}.json`)

interface FixtureUser {
  id: number
  username: string
  email: string
}

interface FixtureLink {
  id: number
  title: string
}

interface FixtureSubfeed {
  id: number
  slug: string
  name: string
}

interface ProgressionFixture {
  runId: number
  users: {
    newcomer: FixtureUser
    qualified: FixtureUser
    editor: FixtureUser
    localmod: FixtureUser
    admin: { id: number; username: string }
  }
  links: {
    featuredUserFeed: FixtureLink
    subfeedLink: FixtureLink
    adminEditorial: FixtureLink
    expiredEditorial: FixtureLink
    controversial: FixtureLink
    softDeleted: FixtureLink
    quarantined: FixtureLink
    quarantineTarget: FixtureLink
  }
  subfeeds: {
    qualifiedSubfeed: FixtureSubfeed
    adminSubfeed: FixtureSubfeed
  }
}

function loadFixtures(): ProgressionFixture {
  if (!fs.existsSync(FIXTURE_FILE)) {
    throw new Error(
      `Fixture file not found at ${FIXTURE_FILE}. The 'setup' project (progression.setup.ts) must run first.`,
    )
  }
  return JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8')) as ProgressionFixture
}

// Loaded lazily in `beforeAll` — Playwright imports/transpiles spec files during
// the discovery phase, which happens *before* the `setup` project runs. Reading
// the fixture at module-load time would therefore race the setup.
let fixtures: ProgressionFixture

test.setTimeout(180_000)

test.beforeAll(() => {
  fixtures = loadFixtures()
})

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(60_000)
})

/**
 * Locates the LinkCard containing a link with the given title on the current
 * page. LinkCards render their title as an anchor; the Card root carries
 * `data-slot="card"`.
 */
function linkCard(page: Page, title: string): Locator {
  return page
    .locator('div[data-slot="card"]')
    .filter({ has: page.getByRole('link', { name: title, exact: true }) })
    .first()
}

// Feed assertions use `?mode=new` so the freshly-created deterministic fixtures
// sort first (by createdAt), keeping the assertions stable even when the shared
// dev database already contains a large number of links.
const FEED_URL = '/?mode=new'

test.describe('Progression & promotion lifecycle', () => {
  test.describe('Standing progression (criterion 1)', () => {
    test.use({ storageState: AUTH('user') })

    test('profiles surface the public trust label derived from activity signals', async ({
      page,
    }) => {
      // Newcomer (no signals).
      await page.goto(`/user/${fixtures.users.newcomer.username}`)
      await expect(
        page.getByRole('heading', { name: fixtures.users.newcomer.username }),
      ).toBeVisible()
      await expect(page.getByText('Newcomer', { exact: true }).first()).toBeVisible()

      // Qualified member (~200 contribution) -> Recognized + uploader.
      await page.goto(`/user/${fixtures.users.qualified.username}`)
      await expect(
        page.getByRole('heading', { name: fixtures.users.qualified.username }),
      ).toBeVisible()
      await expect(page.getByText('Recognized', { exact: true }).first()).toBeVisible()

      // Editor member (~300 contribution + 100 interaction) -> Trusted + editor.
      await page.goto(`/user/${fixtures.users.editor.username}`)
      await expect(
        page.getByRole('heading', { name: fixtures.users.editor.username }),
      ).toBeVisible()
      await expect(page.getByText('Trusted', { exact: true }).first()).toBeVisible()
    })
  })

  test.describe('Subfeed creation gate (criterion 2)', () => {
    test.describe('unqualified member', () => {
      test.use({ storageState: AUTH('newcomer') })

      test('sees the eligibility gate and cannot create a Subfeed', async ({ page }) => {
        await page.goto('/subfeeds/new')

        // Gate copy (dictionary subfeeds.eligibilityGate).
        await expect(page.getByText('SubFeeds are earned')).toBeVisible()
        await expect(page.getByText('Your path to creating a SubFeed')).toBeVisible()

        // Requirement progress bars render for each candidate path.
        await expect(page.getByText('Uploader candidacy', { exact: true })).toBeVisible()
        await expect(page.getByText('Editor candidacy', { exact: true })).toBeVisible()
        await expect(page.getByText('Strong Recruiter standing', { exact: true })).toBeVisible()

        // No create form is rendered.
        await expect(page.getByText('Create a SubFeed', { exact: true })).toHaveCount(0)
        await expect(page.locator('input#name')).toHaveCount(0)
      })
    })

    test.describe('qualified member', () => {
      test.use({ storageState: AUTH('qualified') })

      test('renders the create form and creates a configured Subfeed', async ({ page }) => {
        await page.goto('/subfeeds/new')

        await expect(page.getByText('Create a SubFeed', { exact: true })).toBeVisible()

        const name = `E2E UI Subfeed ${Date.now()}`
        await page.locator('input#name').fill(name)
        await page
          .locator('textarea#description')
          .fill('A Subfeed created through the UI during the E2E progression workflow.')
        await page.getByRole('button', { name: 'Create SubFeed' }).click()

        // Lands on the new subfeed page and the roster renders with owner
        // management controls.
        await expect(page).toHaveURL(/\/subfeeds\/[a-z0-9-]+/, { timeout: 60_000 })
        await expect(page.getByText('Roles & Roster')).toBeVisible()
        await expect(
          page.getByText(
            'Promote members to local roles, revoke roles, or remove members below.',
          ),
        ).toBeVisible()
      })
    })
  })

  test.describe('Subfeed-scoped governance (criterion 3)', () => {
    test.describe('subfeed owner', () => {
      test.use({ storageState: AUTH('qualified') })

      test('governs their own Subfeed and assigns a local role via the UI', async ({ page }) => {
        await page.goto(`/subfeeds/${fixtures.subfeeds.qualifiedSubfeed.slug}`)

        await expect(
          page.getByText(
            'Promote members to local roles, revoke roles, or remove members below.',
          ),
        ).toBeVisible()

        const localmodRow = page.locator('li').filter({ hasText: fixtures.users.localmod.username })
        await expect(localmodRow).toBeVisible()
        await localmodRow.getByRole('button', { name: 'Make moderator' }).click()

        // The local role is reflected in the roster as a Moderator badge.
        await expect(localmodRow.getByText('Moderator', { exact: true })).toBeVisible()
      })

      test('has no management controls on another member\'s Subfeed', async ({ page }) => {
        await page.goto(`/subfeeds/${fixtures.subfeeds.adminSubfeed.slug}`)

        await expect(
          page.getByText('Only the owner and local moderators can change this roster.'),
        ).toBeVisible()
        await expect(page.getByRole('button', { name: 'Make moderator' })).toHaveCount(0)
      })
    })

    test.describe('local moderator (no site-wide roles)', () => {
      test.use({ storageState: AUTH('localmod') })

      test('can govern local content but cannot perform global administrative actions', async ({
        page,
      }) => {
        // Local moderator can manage the Subfeed they govern.
        await page.goto(`/subfeeds/${fixtures.subfeeds.qualifiedSubfeed.slug}`)
        await expect(
          page.getByText(
            'Promote members to local roles, revoke roles, or remove members below.',
          ),
        ).toBeVisible()

        // No admin standing/role safety controls on any profile.
        await page.goto(`/user/${fixtures.users.newcomer.username}`)
        await expect(page.getByText(/Admin Standing & Role Safety Controls/)).toHaveCount(0)

        // No content safety controls on a link detail page.
        await page.goto(`/link/${fixtures.links.featuredUserFeed.id}`)
        await expect(page.getByText(/Admin Safety Controls:/)).toHaveCount(0)

        // /admin is not reachable for non-admins.
        await page.goto('/admin')
        await expect(page).not.toHaveURL(/\/admin\/?$/)
      })
    })

    test.describe('administrator', () => {
      test.use({ storageState: AUTH('user') })

      test('sees safety controls and quarantines content out of the Main Feed', async ({
        page,
      }) => {
        // Admin safety controls appear on a member profile.
        await page.goto(`/user/${fixtures.users.newcomer.username}`)
        await expect(page.getByText(/Admin Standing & Role Safety Controls/)).toBeVisible()

        // Content safety controls appear on a link detail page.
        await page.goto(`/link/${fixtures.links.quarantineTarget.id}`)
        await expect(page.getByText(/Admin Safety Controls:/)).toBeVisible()

        // Quarantine the target link via the UI.
        await page.getByRole('button', { name: 'Quarantine' }).click()
        await expect(page.getByRole('button', { name: 'Unquarantine' })).toBeVisible()

        // It disappears from the Home feed.
        await page.goto(FEED_URL)
        await expect(
          page.getByRole('link', { name: fixtures.links.quarantineTarget.title, exact: true }),
        ).toHaveCount(0)
      })
    })
  })

  test.describe('Main Feed promotion + editorial priority (criterion 4)', () => {
    // Use the qualified member (language: en) — the origin and editorial-priority
    // badges are dictionary-driven and render in the viewer's language.
    test.use({ storageState: AUTH('qualified') })

    test('promotes qualified User Feed and Subfeed content with origin badges and respects the editorial priority window', async ({
      page,
    }) => {
      await page.goto(FEED_URL)

      // Featured User Feed link appears with its origin badge.
      const featuredCard = linkCard(page, fixtures.links.featuredUserFeed.title)
      await expect(featuredCard).toBeVisible()
      await expect(
        featuredCard.getByText(`From ${fixtures.users.qualified.username}'s User Feed`),
      ).toBeVisible()

      // Qualifying Subfeed link appears with its Subfeed origin badge.
      const subfeedCard = linkCard(page, fixtures.links.subfeedLink.title)
      await expect(subfeedCard).toBeVisible()
      await expect(
        subfeedCard.locator(`a[href="/subfeeds/${fixtures.subfeeds.qualifiedSubfeed.slug}"]`),
      ).toBeVisible()

      // Admin-authored main-feed link carries the active Editorial Priority badge.
      const editorialCard = linkCard(page, fixtures.links.adminEditorial.title)
      await expect(editorialCard).toBeVisible()
      await expect(editorialCard.getByText('Editorial Priority', { exact: true })).toBeVisible()

      // Expired-priority main-feed link is still present but has no badge.
      const expiredCard = linkCard(page, fixtures.links.expiredEditorial.title)
      await expect(expiredCard).toBeVisible()
      await expect(expiredCard.getByText('Editorial Priority', { exact: true })).toHaveCount(0)
    })
  })

  test.describe('Main Feed safety exclusions (criterion 5)', () => {
    test.use({ storageState: AUTH('user') })

    test('excludes controversial, soft-deleted, and quarantined items', async ({ page }) => {
      await page.goto(FEED_URL)

      await expect(
        page.getByRole('link', { name: fixtures.links.controversial.title, exact: true }),
      ).toHaveCount(0)
      await expect(
        page.getByRole('link', { name: fixtures.links.softDeleted.title, exact: true }),
      ).toHaveCount(0)
      await expect(
        page.getByRole('link', { name: fixtures.links.quarantined.title, exact: true }),
      ).toHaveCount(0)
    })
  })
})
