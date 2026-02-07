import { test, expect, Page } from '@playwright/test'

test.describe('Frontend', () => {
  test('can go on homepage', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/Link Hub/)

    const heading = page.locator('h1').first()

    await expect(heading).toHaveText('Link Hub')
  })
})
