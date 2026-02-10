import { test, expect } from '@playwright/test'
import { faker } from '@faker-js/faker'

test.use({
  storageState: 'tests/playwright/.auth/user.json',
})

test.describe('Comments Flow', () => {
  test('authenticated user can comment on a link', async ({ page }) => {
    const commentText = faker.lorem.sentence()
    const linkTitle = faker.lorem.words(3)
    const linkURL = faker.internet.url()

    // User is already logged in via global setup

    // 3. Create a Link to comment on
    await page.goto('/new-link')
    await page.getByLabel('Title').fill(linkTitle)
    await page.getByLabel('URL').fill(linkURL)
    // Use default value text or placeholder to find the Select trigger
    await page.locator('button[role="combobox"]').first().click()
    await page.getByRole('option', { name: 'Article' }).click()
    await page.getByRole('button', { name: 'Submit' }).click()

    // 4. Navigate to Submitted and then to Link Details
    await page.goto('/submitted')
    await expect(page.getByText(linkTitle)).toBeVisible()

    // Click on the link title to go to details page (assuming title is a link)
    // Need to verify if title links to details or external.
    // Usually titles link to external URL. There should be a "comments" link or button.
    // Let's check for a "comments" link.
    // Dictionary says `comments: 'comments'`.

    // Find the card.
    const linkCard = page.locator('div', { has: page.getByText(linkTitle) }).first()

    // Click the comments link inside the card.
    // It might be "0 comments" or just "comments".
    // Use Playwright pseudo-class :has-text to find the specific link card and then the comments link inside it.
    await page.locator(`div:has-text("${linkTitle}") a[href*="/link/"]`).first().click()

    // 5. Add Comment
    // We should be on /link/[id]
    await expect(page).toHaveURL(/link\/\d+/)

    // Check for comment form
    // Placeholder from CommentForm.tsx: "What are your thoughts?"
    await page.getByRole('textbox').fill(commentText)

    // Button is "Submit"
    await page.getByRole('button', { name: 'Submit' }).click()

    // 6. Verify Comment Appears
    await expect(page.getByText(commentText)).toBeVisible()
  })
})
