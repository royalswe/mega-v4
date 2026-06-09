import type { Payload } from 'payload'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { collectCandidates } from '../lib/sources'
import { filterDuplicates } from '../lib/deduplication'
import { rankCandidates } from '../lib/ai'

const AGENT_EMAIL = 'agent@existenz.se'
const AGENT_USERNAME = 'auto-agent'

async function getAgentUser(payload: Payload) {
  const { docs: users } = await payload.find({
    collection: 'users',
    where: {
      email: {
        equals: AGENT_EMAIL,
      },
    },
    limit: 1,
  })

  if (users.length > 0) {
    return users[0]
  }

  return await payload.create({
    collection: 'users',
    data: {
      email: AGENT_EMAIL,
      username: AGENT_USERNAME,
      password: 'agent-password-123!',
      roles: ['user', 'uploader'],
      settings: {
        nsfw: true,
        language: 'sv',
      },
    },
    overrideAccess: true,
  })
}

export async function discoverLinks() {
  console.log('Starting link discovery job...')
  const payload = await getPayload({ config: configPromise })
  const agentUser = await getAgentUser(payload)

  // 1. Collect candidates (100-200)
  console.log('Collecting candidates from sources...')
  const candidates = await collectCandidates()
  console.log(`Collected ${candidates.length} candidates.`)

  // 2. Deduplicate
  console.log('Filtering duplicates...')
  const uniqueCandidates = await filterDuplicates(candidates, payload)
  console.log(`${uniqueCandidates.length} unique candidates remaining.`)

  if (uniqueCandidates.length === 0) {
    console.log('No new unique candidates found.')
    return
  }

  // 3. AI Ranking and Title Generation
  console.log('Ranking candidates with AI...')
  const ranked = await rankCandidates(uniqueCandidates)
  console.log(`${ranked.length} candidates passed AI ranking (score >= 8).`)

  // 4. Take top 10
  const topTake = ranked.slice(0, 10)

  // 5. Save to Payload as drafts
  console.log(`Saving ${topTake.length} links to Payload as drafts...`)
  let addedCount = 0
  for (const item of topTake) {
    try {
      await payload.create({
        collection: 'links',
        data: {
          title: item.aiTitle,
          url: item.url,
          description: item.description || '',
          nsfw: item.nsfw,
          type: item.type,
          feed: 'main',
          user: agentUser.id,
          _status: 'draft',
          aiScore: item.score,
          aiReason: item.aiReason,
          source: item.source,
        },
        overrideAccess: true,
      })
      console.log(`[ADDED DRAFT] ${item.aiTitle} (Score: ${item.score})`)
      addedCount++
    } catch (error) {
      console.error(`Failed to add link ${item.url}:`, error)
    }
  }

  console.log(`Finished. Added ${addedCount} draft links.`)
}

// If running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  discoverLinks()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
