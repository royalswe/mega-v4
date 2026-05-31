import type { Locator, Page } from '@playwright/test'

import { expect } from '@playwright/test'

export class LinkPage {
  readonly page: Page
  readonly form: Locator
  readonly titleInput: Locator
  readonly urlInput: Locator
  readonly typeTrigger: Locator
  readonly submitButton: Locator

  constructor(page: Page) {
    this.page = page
    this.form = page
      .locator('form')
      .filter({ has: page.locator('input[name="title"]') })
      .first()
    this.titleInput = this.form.locator('input[name="title"]').first()
    this.urlInput = this.form.locator('input[name="url"]').first()
    // Optional content type select; not required for successful submit.
    this.typeTrigger = this.form.locator('button[role="combobox"]').first()
    this.submitButton = this.form.locator('button[type="submit"]').first()
  }

  async gotoNewLink() {
    await this.page.goto('/new-link')
  }

  async createLink(title: string, url: string) {
    await this.gotoNewLink()
    await expect(this.titleInput).toBeVisible()
    await this.titleInput.fill(title)
    await this.urlInput.fill(url)

    await this.submitButton.click()
  }

  async verifyLinkVisible(title: string) {
    // Navigate to /submitted to see the link if it's draft/pending, or confirm where it lands
    // Based on test analysis, newly created links might be in /submitted
    await this.page.goto('/submitted')
    await expect(this.page.getByText(title)).toBeVisible()
  }
}
