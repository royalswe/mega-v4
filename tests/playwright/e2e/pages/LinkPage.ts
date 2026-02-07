import { type Page, type Locator, expect } from '@playwright/test'

export class LinkPage {
  readonly page: Page
  readonly titleInput: Locator
  readonly urlInput: Locator
  readonly typeTrigger: Locator
  readonly submitButton: Locator

  constructor(page: Page) {
    this.page = page
    this.titleInput = page.getByLabel('Title')
    this.urlInput = page.getByLabel('URL')
    // Generic selector for Shadcn Select trigger
    this.typeTrigger = page.locator('button[role="combobox"]').first()
    this.submitButton = page.getByRole('button', { name: 'Submit' })
  }

  async gotoNewLink() {
    await this.page.goto('/new-link')
  }

  async createLink(
    title: string,
    url: string,
    type: 'Article' | 'Video' | 'Repository' = 'Article',
  ) {
    await this.gotoNewLink()
    await this.titleInput.fill(title)
    await this.urlInput.fill(url)

    // Select Type
    await this.typeTrigger.click()
    await this.page.getByRole('option', { name: type }).click()

    await this.submitButton.click()
    // Wait for the navigation to complete by checking for a specific element on the target page
    await this.page.waitForSelector('text=Link submitted successfully!', { timeout: 10000 })
  }

  async verifyLinkVisible(title: string) {
    // Navigate to /submitted to see the link if it's draft/pending, or confirm where it lands
    // Based on test analysis, newly created links might be in /submitted
    await this.page.goto('/submitted')
    await expect(this.page.getByText(title)).toBeVisible()
  }
}
