import { type Page, type Locator, expect } from '@playwright/test'

export class VotingPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  getLinkCard(text: string): Locator {
    return this.page.locator('div', { has: this.page.getByText(text) }).first()
  }

  async upvote(linkText: string) {
    const card = this.getLinkCard(linkText)
    // Finding the upvote button within the card.
    // Assuming it is the first button or we can refine selector later if needed.
    const upvoteBtn = card.getByRole('button').first()
    await upvoteBtn.click()
  }

  async verifyVoteCount(linkText: string, count: number) {
    const card = this.getLinkCard(linkText)
    await expect(card).toContainText(count.toString())
  }
}
