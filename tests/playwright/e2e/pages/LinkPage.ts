import type { Locator, Page } from '@playwright/test'

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
    const meResponse = await this.page.request.get('/api/users/me')
    if (!meResponse.ok()) {
      throw new Error(`Could not resolve authenticated user: ${meResponse.status()}`)
    }

    const mePayload = (await meResponse.json()) as
      { id?: number | string } | { user?: { id?: number | string } }

    const meId =
      'user' in mePayload && mePayload.user
        ? mePayload.user.id
        : 'id' in mePayload
          ? mePayload.id
          : undefined

    if (typeof meId !== 'number') {
      throw new Error('Authenticated user ID is not a numeric value')
    }

    const createResponse = await this.page.request.post('/api/links?draft=true', {
      data: {
        title,
        url,
        type: 'article',
        feed: 'main',
        user: meId,
      },
    })

    if (!createResponse.ok()) {
      throw new Error(`Link creation failed: ${createResponse.status()}`)
    }

    const createPayload = (await createResponse.json()) as
      { id?: number | string } | { doc?: { id?: number | string } }

    const rawId =
      'id' in createPayload
        ? createPayload.id
        : 'doc' in createPayload
          ? createPayload.doc?.id
          : undefined

    if (typeof rawId === 'number') {
      return rawId
    }

    const parsed = typeof rawId === 'string' ? Number(rawId) : Number.NaN
    if (Number.isFinite(parsed)) {
      return parsed
    }

    throw new Error(`Could not resolve created link ID for title: ${title}`)
  }
}
