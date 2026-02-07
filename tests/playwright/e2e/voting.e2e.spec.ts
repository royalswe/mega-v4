import { test, expect } from '@playwright/test'
import { LinkPage } from './pages/LinkPage'
import { VotingPage } from './pages/VotingPage'
import { faker } from '@faker-js/faker'

test.describe('Voting Flow', () => {
  test('user can create a link and vote on it', async ({ page }) => {
    const linkTitle = faker.lorem.words(4) // Title as text
    const linkUrl = faker.internet.url()

    const linkPage = new LinkPage(page)
    const votingPage = new VotingPage(page)

    // 1. Create a Link (User is already logged in via global setup)
    await linkPage.createLink(linkTitle, linkUrl, 'Video')

    // 2. Verify Link appears
    await linkPage.verifyLinkVisible(linkTitle)

    // 3. Vote on the link
    // Find the upvote button for this link.
    const linkCard = votingPage.getLinkCard(linkTitle)
    await expect(linkCard).toBeVisible()

    // 4. Verify Vote Count starts at 0 or check initial state
    // New links have 0 votes.
    await expect(linkCard).toContainText('0')

    await votingPage.upvote(linkTitle)

    // 5. Verify Vote Count updates to 1
    await expect(linkCard).toContainText('1')
  })
})
