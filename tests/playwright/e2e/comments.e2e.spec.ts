import { test, expect } from '@playwright/test'
import { faker } from '@faker-js/faker'

test.describe('Comments Flow', () => {
  test('user can login and comment on a link', async ({ page }) => {
    const email = faker.internet.email()
    const password = faker.internet.password()
    const username = faker.internet.username()
    const commentText = faker.lorem.sentence()
    const linkTitle = faker.lorem.words(3)
    const linkURL = faker.internet.url()

    // 1. Register
    await page.goto('/create-account')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm Password').fill(password)
    await page.getByRole('button', { name: 'Create Account' }).click()

    // 2. Login
    await expect(page).toHaveURL(/\/login\?.*/, { timeout: 10000 })
    await page.getByLabel('Email or Username').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Log In' }).click()
    await expect(page).toHaveURL('/', { timeout: 10000 })

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
    await page.getByPlaceholder('What are your thoughts?').fill(commentText)

    // Button is "Submit"
    await page.getByRole('button', { name: 'Submit' }).click()

    // 6. Verify Comment Appears
    await expect(page.getByText(commentText)).toBeVisible()
  })
})
