import { type Page, type Locator, expect } from '@playwright/test'

export class VotingPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async gotoLink(linkId: number) {
    await this.page.goto(`/link/${linkId}`)
    await expect(this.page).toHaveURL(new RegExp(`/link/${linkId}$`))
  }

  private getVoteCount(linkId: number): Locator {
    return this.page.getByTestId(`link-vote-count-${linkId}`)
  }

  async upvote() {
    const upvoteBtn = this.page.getByRole('button', { name: 'Upvote link' }).first()
    await upvoteBtn.click()
  }

  async verifyVoteCount(linkId: number, count: number) {
    const voteCount = this.getVoteCount(linkId)
    await expect(voteCount).toHaveText(String(count))
  }
}
