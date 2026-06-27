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

  async createLink(title: string, url: string): Promise<number> {
    await this.gotoNewLink()
    await expect(this.titleInput).toBeVisible()
    await this.titleInput.fill(title)
    await this.urlInput.fill(url)

    await this.submitButton.click()

    // Form returns to idle after submit; then resolve the created link by title.
    await expect(this.submitButton).toBeEnabled({ timeout: 15000 })

    let createdLinkId: number | null = null
    await expect
      .poll(
        async () => {
          const response = await this.page.request.get(
            `/api/links?where[title][equals]=${encodeURIComponent(title)}&sort=-createdAt&limit=1&draft=true`,
          )

          if (!response.ok()) return null

          const payload = (await response.json()) as {
            docs?: Array<{ id?: number }>
          }

          const id = payload.docs?.[0]?.id
          createdLinkId = typeof id === 'number' ? id : null
          return createdLinkId
        },
        { timeout: 15000 },
      )
      .not.toBeNull()

    if (createdLinkId === null) {
      throw new Error(`Could not resolve created link ID for title: ${title}`)
    }

    return createdLinkId
  }
}
