import { test, expect } from '@playwright/test'
import type { Browser, Page, Locator } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Browser journeys.
 *
 * These specs assert what only a browser can prove: that a policy decision
 * reaches the DOM, that a control is offered to the right role, and that a
 * publish flow writes through to a publicly readable page.
 *
 * They deliberately do NOT re-assert the policy itself. Promotion thresholds,
 * visibility exclusions, editorial priority windows, eligibility maths and role
 * derivation are covered against their module interfaces in
 * `tests/vitest/int/`, where a change costs one spec instead of a 15-minute
 * browser run.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_FILE = path.join(__dirname, '.fixtures', 'progression.json')
const AUTH = (name: string) => path.join(__dirname, '..', '.auth', `${name}.json`)
const BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

/** A browser context with no auth state, for asserting anonymous public reads. */
async function anonymousContext(
  browser: Browser,
  cookies: Array<{ name: string; value: string }> = [],
) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  })
  if (cookies.length > 0) {
    await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: BASE_URL })))
  }
  return context
}

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
    localmod: FixtureUser
    admin: { id: number; username: string }
  }
  links: {
    featuredUserFeed: FixtureLink
    subfeedLink: FixtureLink
    adminEditorial: FixtureLink
    quarantineTarget: FixtureLink
  }
  subfeeds: {
    qualifiedSubfeed: FixtureSubfeed
    adminSubfeed: FixtureSubfeed
    moderatorSubfeed: FixtureSubfeed
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

test.describe('Progression & promotion surfaces', () => {
  test.describe('Standing labels reach the profile', () => {
    test.use({ storageState: AUTH('user') })

    test('renders the public trust label for the member it belongs to', async ({ page }) => {
      // The ladder maths is unit-tested in reputation.int.spec.ts. This test only
      // proves the derived label is what the profile renders.
      await page.goto(`/user/${fixtures.users.newcomer.username}`)
      await expect(
        page.getByRole('heading', { name: fixtures.users.newcomer.username }),
      ).toBeVisible()
      await expect(page.getByText('Newcomer', { exact: true }).first()).toBeVisible()

      await page.goto(`/user/${fixtures.users.qualified.username}`)
      await expect(
        page.getByRole('heading', { name: fixtures.users.qualified.username }),
      ).toBeVisible()
      await expect(page.getByText('Recognized', { exact: true }).first()).toBeVisible()
    })
  })

  test.describe('Subfeed creation gate', () => {
    test.describe('unqualified member', () => {
      test.use({ storageState: AUTH('newcomer') })

      test('renders the eligibility gate instead of the create form', async ({ page }) => {
        await page.goto('/subfeeds/new')

        await expect(page.getByText('SubFeeds are earned')).toBeVisible()
        await expect(page.getByText('Your path to creating a SubFeed')).toBeVisible()
        await expect(page.getByText('Uploader candidacy', { exact: true })).toBeVisible()
        await expect(page.locator('input#name')).toHaveCount(0)
      })
    })

    test.describe('qualified member', () => {
      test.use({ storageState: AUTH('qualified') })

      test('creates a configured Subfeed through the form', async ({ page }) => {
        await page.goto('/subfeeds/new')

        await expect(page.getByText('Create a SubFeed', { exact: true })).toBeVisible()

        const name = `E2E UI Subfeed ${Date.now()}`
        await page.locator('input#name').fill(name)
        await page
          .locator('textarea#description')
          .fill('A Subfeed created through the UI during the E2E progression workflow.')
        await page.getByRole('button', { name: 'Create SubFeed' }).click()

        await expect(page).toHaveURL(/\/subfeeds\/[a-z0-9-]+/, { timeout: 60_000 })
        await expect(page.getByText('Roles & Roster')).toBeVisible()
        await expect(
          page.getByText('Promote members to local roles, revoke roles, or remove members below.'),
        ).toBeVisible()
      })
    })
  })

  test.describe('Subfeed-scoped governance', () => {
    test.describe('subfeed owner', () => {
      test.use({ storageState: AUTH('qualified') })

      test('assigns a local role and shows the resulting badge', async ({ page }) => {
        await page.goto(`/subfeeds/${fixtures.subfeeds.qualifiedSubfeed.slug}`)

        await expect(
          page.getByText('Promote members to local roles, revoke roles, or remove members below.'),
        ).toBeVisible()

        const localmodRow = page.locator('li').filter({ hasText: fixtures.users.localmod.username })
        await expect(localmodRow).toBeVisible()

        const revokeModerator = localmodRow.getByRole('button', {
          name: 'Revoke Moderator',
          exact: true,
        })
        if (await revokeModerator.isVisible()) {
          await revokeModerator.click()
          await expect(localmodRow.getByRole('button', { name: 'Make moderator' })).toBeVisible()
        }
        await localmodRow.getByRole('button', { name: 'Make moderator' }).click()

        await expect(localmodRow.getByText('Moderator', { exact: true })).toBeVisible()
      })

      test("offers no roster controls on another member's Subfeed", async ({ page }) => {
        await page.goto(`/subfeeds/${fixtures.subfeeds.adminSubfeed.slug}`)

        await expect(
          page.getByText('Only the owner and local moderators can change this roster.'),
        ).toBeVisible()
        await expect(page.getByRole('button', { name: 'Make moderator' })).toHaveCount(0)
      })
    })

    test.describe('local moderator (no site-wide roles)', () => {
      test.use({ storageState: AUTH('localmod') })

      test('governs their Subfeed but is offered no administrative controls', async ({ page }) => {
        await page.goto(`/subfeeds/${fixtures.subfeeds.moderatorSubfeed.slug}`)
        await expect(
          page.getByText('Promote members to local roles, revoke roles, or remove members below.'),
        ).toBeVisible()

        await page.goto(`/user/${fixtures.users.newcomer.username}`)
        await expect(page.getByText(/Admin Standing & Role Safety Controls/)).toHaveCount(0)

        await page.goto(`/link/${fixtures.links.featuredUserFeed.id}`)
        await expect(page.getByText(/Admin Safety Controls:/)).toHaveCount(0)
      })
    })

    test.describe('administrator', () => {
      test.use({ storageState: AUTH('user') })

      test('quarantines content from the link page', async ({ page }) => {
        await page.goto(`/user/${fixtures.users.newcomer.username}`)
        await expect(page.getByText(/Admin Standing & Role Safety Controls/)).toBeVisible()

        await page.goto(`/link/${fixtures.links.quarantineTarget.id}`)
        await expect(page.getByText(/Admin Safety Controls:/)).toBeVisible()

        await page.getByRole('button', { name: 'Quarantine' }).click()
        await expect(page.getByRole('button', { name: 'Unquarantine' })).toBeVisible()
      })
    })
  })

  test.describe('Main Feed origin badges', () => {
    // Use the qualified member (language: en) — the origin and editorial-priority
    // badges are dictionary-driven and render in the viewer's language.
    test.use({ storageState: AUTH('qualified') })

    test('labels promoted User Feed and Subfeed content with its origin', async ({ page }) => {
      await page.goto(FEED_URL)

      const featuredCard = linkCard(page, fixtures.links.featuredUserFeed.title)
      await expect(featuredCard).toBeVisible()
      await expect(
        featuredCard.getByText(`From ${fixtures.users.qualified.username}'s User Feed`),
      ).toBeVisible()

      const subfeedCard = linkCard(page, fixtures.links.subfeedLink.title)
      await expect(subfeedCard).toBeVisible()
      await expect(
        subfeedCard.locator(`a[href="/subfeeds/${fixtures.subfeeds.qualifiedSubfeed.slug}"]`),
      ).toBeVisible()

      const editorialCard = linkCard(page, fixtures.links.adminEditorial.title)
      await expect(editorialCard).toBeVisible()
      await expect(editorialCard.getByText('Editorial Priority', { exact: true })).toBeVisible()
    })
  })

  test.describe('Personal-first publishing journeys (#26)', () => {
    test.describe('newcomer with no joined SubFeeds', () => {
      test.use({ storageState: AUTH('newcomer') })

      test('publishes a link from Home and exposes a publicly readable item', async ({
        page,
        browser,
      }) => {
        const suffix = `${fixtures.runId}-${Date.now()}`
        const title = `Newcomer personal link ${suffix}`
        const url = `https://example.com/e2e/${suffix}`

        await page.goto('/')

        const contributeCard = page
          .locator('section')
          .filter({ has: page.getByRole('button', { name: 'Share a link', exact: true }) })
          .first()

        await expect(contributeCard).toBeVisible()
        await expect(
          contributeCard.getByRole('button', { name: 'Start a discussion', exact: true }),
        ).toBeVisible()

        // The Home route is server-rendered; retry the click until the client
        // bundle has hydrated and Radix mounts the dialog.
        await expect(async () => {
          await contributeCard.getByRole('button', { name: 'Share a link', exact: true }).click()
          await expect(page.getByRole('dialog')).toBeVisible({ timeout: 3_000 })
        }).toPass({ timeout: 30_000 })

        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByTestId('destination-user-feed-summary')).toContainText('Your Feed')
        // A membership-only member is offered no SubFeed or Main Feed destination.
        await expect(dialog.getByText('Main Feed', { exact: true })).toHaveCount(0)
        await expect(dialog.getByText('SubFeed', { exact: true })).toHaveCount(0)

        await dialog.getByLabel('URL', { exact: true }).fill(url)
        await dialog.getByLabel('Title', { exact: true }).fill(title)
        await dialog.getByRole('button', { name: 'Submit', exact: true }).click()

        const banner = dialog.getByTestId('submission-outcome-banner')
        await expect(banner).toBeVisible()
        await expect(banner).toContainText('Published to your User Feed')

        const itemLink = banner.getByTestId('submission-outcome-item-link')
        await expect(itemLink).toHaveAttribute('href', /^\/link\/\d+$/)
        const itemHref = await itemLink.getAttribute('href')

        // Closing the modal must leave a compact bar on Home with the same links.
        await dialog.getByRole('button', { name: 'Close form modal' }).click()
        await expect(dialog).toHaveCount(0)

        const homeBar = page.getByTestId('home-outcome-bar')
        await expect(homeBar).toBeVisible()
        await expect(homeBar).toContainText('Published to your User Feed')
        await expect(homeBar.getByTestId('home-outcome-item-link')).toHaveAttribute(
          'href',
          itemHref ?? '',
        )

        await homeBar.getByTestId('home-outcome-item-link').click()
        await page.waitForURL(/\/link\/\d+$/)

        const linkPath = new URL(page.url()).pathname
        await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()

        // Public readability is asserted separately from the success banner.
        const anon = await anonymousContext(browser)
        try {
          const anonPage = await anon.newPage()
          await anonPage.goto(linkPath)
          await expect(anonPage.getByRole('heading', { level: 1, name: title })).toBeVisible()
          await anonPage.goto(`/user/${fixtures.users.newcomer.username}?tab=links`)
          await expect(anonPage.getByRole('link', { name: title, exact: true })).toBeVisible()
        } finally {
          await anon.close()
        }
      })

      test('publishes a post from /new-post and exposes a publicly readable item', async ({
        page,
        browser,
      }) => {
        const suffix = `${fixtures.runId}-${Date.now()}`
        const title = `Newcomer personal post ${suffix}`

        await page.goto('/new-post')

        await expect(page.getByTestId('destination-user-feed-summary')).toContainText('Your Feed')
        await expect(page.getByText('Main Feed', { exact: true })).toHaveCount(0)

        await page.getByLabel('Title', { exact: true }).fill(title)
        const editor = page.locator('[contenteditable="true"]').first()
        await editor.click()
        await editor.fill(`A personal-first post body for the newcomer journey ${suffix}.`)

        await page.getByRole('button', { name: 'Submit Post', exact: true }).click()

        const banner = page.getByTestId('submission-outcome-banner')
        await expect(banner).toBeVisible()
        await expect(banner).toContainText('Published to your User Feed')

        const itemLink = banner.getByTestId('submission-outcome-item-link')
        await expect(itemLink).toHaveAttribute('href', /^\/post\/\d+$/)
        await itemLink.click()
        await page.waitForURL(/\/post\/\d+$/)

        const postPath = new URL(page.url()).pathname
        await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()

        const anon = await anonymousContext(browser)
        try {
          const anonPage = await anon.newPage()
          await anonPage.goto(postPath)
          await expect(anonPage.getByRole('heading', { level: 1, name: title })).toBeVisible()
          await anonPage.goto(`/user/${fixtures.users.newcomer.username}?tab=posts`)
          await expect(anonPage.getByRole('link', { name: title, exact: true })).toBeVisible()
        } finally {
          await anon.close()
        }
      })
    })

    test.describe('membership-only participant', () => {
      test.use({ storageState: AUTH('localmod') })

      test('sees the rate-limited publishing note instead of publish controls', async ({ page }) => {
        await page.goto(`/subfeeds/${fixtures.subfeeds.adminSubfeed.slug}`)

        const note = page.getByTestId('subfeed-ineligible-publish-note')
        await expect(note).toBeVisible()
        await expect(note).toContainText('local SubFeed role')
        await expect(note.getByRole('link', { name: 'Share a link', exact: true })).toHaveAttribute(
          'href',
          '/new-link',
        )
        await expect(
          note.getByRole('link', { name: 'Start a discussion', exact: true }),
        ).toHaveAttribute('href', '/new-post')
        await expect(page.getByRole('button', { name: 'Submit Link' })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Create Post' })).toHaveCount(0)
      })
    })

    test.describe('authorised local publisher', () => {
      test.use({ storageState: AUTH('qualified') })

      test('is offered both publish controls in their own SubFeed', async ({ page }) => {
        await page.goto(`/subfeeds/${fixtures.subfeeds.qualifiedSubfeed.slug}`)

        await expect(page.getByTestId('subfeed-ineligible-publish-note')).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Submit Link' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Create Post' })).toBeVisible()
      })
    })

    test('documents the personal-first model without numeric thresholds', async ({ browser }) => {
      const en = await anonymousContext(browser)
      try {
        const enPage = await en.newPage()
        await enPage.goto('/how-it-works')
        await expect(
          enPage.getByRole('heading', { name: 'Personal-First Publishing', exact: true }),
        ).toBeVisible()
        await expect(enPage.getByText('public User Feed').first()).toBeVisible()
        await expect(enPage.getByText('discovery x 1.6')).toHaveCount(0)
        await expect(enPage.getByText('Minimum Effective Standing')).toHaveCount(0)
      } finally {
        await en.close()
      }

      const sv = await anonymousContext(browser, [{ name: 'lang', value: 'sv' }])
      try {
        const svPage = await sv.newPage()
        await svPage.goto('/hur-det-funkar')
        await expect(
          svPage.getByRole('heading', {
            name: 'Publicering börjar i ditt användarflöde',
            exact: true,
          }),
        ).toBeVisible()
        await expect(svPage.getByText('offentliga användarflöde').first()).toBeVisible()
        await expect(svPage.getByText('upptäckt x 1.6')).toHaveCount(0)
        await expect(svPage.getByText('Minsta effektiva anseende')).toHaveCount(0)
      } finally {
        await sv.close()
      }
    })
  })
})
