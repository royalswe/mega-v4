import { test } from '@playwright/test'
import { LinkPage } from './pages/LinkPage'
import { VotingPage } from './pages/VotingPage'
import { faker } from '@faker-js/faker'

test.describe('Voting Flow', () => {
  test('user can create a link and vote on it', async ({ page }) => {
    const linkTitle = faker.lorem.words(4) // Title as text
    const linkUrl = faker.internet.url()

    const linkPage = new LinkPage(page)
    const votingPage = new VotingPage(page)

    // 1. Create a link and resolve its ID from the authenticated API.
    const linkId = await linkPage.createLink(linkTitle, linkUrl)

    // 2. Navigate directly to the new link details page.
    await votingPage.gotoLink(linkId)

    // 3. Verify initial vote count and upvote.
    await votingPage.verifyVoteCount(linkId, 0)
    await votingPage.upvote()

    // 4. Verify vote count updates.
    await votingPage.verifyVoteCount(linkId, 1)
  })
})
