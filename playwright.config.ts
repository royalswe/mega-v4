import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Read from default .env file first
dotenv.config()

// Read from custom test.env file, overriding any existing variables
dotenv.config({ path: path.resolve(__dirname, 'tests/test.env') })

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/playwright/e2e',
  testMatch: '**/*.spec.ts', // Only include files ending with .spec.ts as test files
  /* Next dev cold-compiles routes on first navigation against the shared Postgres
     DB; under parallel workers this can exceed Playwright's 30s default. */
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000',
    screenshot: 'only-on-failure',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/, // Keep the global setup file
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        storageState: 'tests/playwright/.auth/user.json',
      },
    },
    {
      // Layout only: jsdom has no layout engine, so these run in a real browser.
      name: 'mobile-chrome',
      testMatch: /layout\.e2e\.spec\.ts/,
      use: {
        ...devices['Pixel 5'],
        browserName: 'chromium',
      },
    },
    {
      // The narrowest phone we support. Guards the 320px column.
      name: 'mobile-small',
      testMatch: /layout\.e2e\.spec\.ts/,
      use: {
        ...devices['iPhone SE'],
        browserName: 'chromium',
        viewport: { width: 320, height: 568 },
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    reuseExistingServer: true,
    url: 'http://localhost:3000',
  },
})
