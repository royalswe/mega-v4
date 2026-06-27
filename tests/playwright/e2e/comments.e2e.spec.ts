import { test, expect } from '@playwright/test'
import { faker } from '@faker-js/faker'

test.use({
  storageState: 'tests/playwright/.auth/user.json',
})

test.describe('Comments Flow', () => {
  test('authenticated user can comment on a link', async ({ page }) => {
    const commentText = faker.lorem.sentence()

    // Navigate to a submitted link details page.
    await page.goto('/submitted')
    const linkDetailsLink = page.locator('a[href^="/link/"]').first()
    await expect(linkDetailsLink).toBeVisible()
    await linkDetailsLink.click()

    // Add comment on /link/[id].
    await expect(page).toHaveURL(/link\/\d+/)

    const commentEditor = page.locator('[contenteditable="true"]').first()
    await expect(commentEditor).toBeVisible()
    await commentEditor.fill(commentText)

    const commentFormSubmit = page
      .locator('form')
      .filter({ has: commentEditor })
      .locator('button[type="submit"]')
      .first()
    await commentFormSubmit.click()

    // Verify comment appears.
    await expect(page.getByText(commentText)).toBeVisible()
  })
})
