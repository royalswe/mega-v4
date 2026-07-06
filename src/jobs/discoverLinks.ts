import { type Payload, getPayload } from 'payload'
import { fileURLToPath } from 'url'
import path from 'path'
import configPromise from '@payload-config'
import { collectCandidates } from '../lib/sources'
import { filterDuplicates } from '../lib/deduplication'
import { rankCandidates } from '../lib/ai'
import { scrapeMedia } from '../lib/mediaScraper'
import { getEmbedType } from '../lib/media'

const AGENT_EMAIL = 'agent@existenz.se'
const AGENT_USERNAME = 'auto-agent'
const __filename = fileURLToPath(import.meta.url)

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
      password: process.env.AGENT_PASSWORD,
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

  // 4. Save to Payload as drafts (taking top 10 unique, non-duplicate resolved links)
  console.log(`Processing and saving links to Payload as drafts...`)
  let addedCount = 0
  const savedUrls = new Set<string>()
  const savedYoutubeIds = new Set<string>()

  for (const item of ranked) {
    if (addedCount >= 10) {
      break
    }

    try {
      let finalUrl = item.url
      let finalType = item.type
      let finalYoutubeId = item.youtubeId

      const isDirectMedia = /\.(jpeg|jpg|gif|png|webp|svg|mp4|webm|ogg|ogv|mov)(?:\?.*)?$/i.test(item.url)
      const embedInfoOriginal = getEmbedType(item.url)
      const isYoutubeOrVimeo = embedInfoOriginal.type === 'youtube' || embedInfoOriginal.type === 'vimeo'

      if (!isDirectMedia && !isYoutubeOrVimeo) {
        console.log(`Scraping media for candidate page: ${item.url}`)
        const scrapeResult = await scrapeMedia(item.url, 'video')
        if (scrapeResult.success && scrapeResult.suggestions.length > 0) {
          const resolvedVideoUrl = scrapeResult.suggestions[0]
          console.log(`Resolved video URL: ${resolvedVideoUrl} for page ${item.url}`)
          
          finalUrl = resolvedVideoUrl
          finalType = 'video'
          
          const embedInfoResolved = getEmbedType(resolvedVideoUrl)
          if (embedInfoResolved.type === 'youtube' && embedInfoResolved.videoId) {
            finalYoutubeId = embedInfoResolved.videoId
          }
        }
      }

      // Check for duplicates in current batch
      if (savedUrls.has(finalUrl)) {
        console.log(`Skipping duplicate URL in current batch: ${finalUrl}`)
        continue
      }
      if (finalYoutubeId && savedYoutubeIds.has(finalYoutubeId)) {
        console.log(`Skipping duplicate YouTube ID in current batch: ${finalYoutubeId}`)
        continue
      }

      // Check for duplicates in Payload database
      const queryConditions: any[] = [{ url: { equals: finalUrl } }]
      if (finalYoutubeId) {
        queryConditions.push({ url: { equals: finalYoutubeId } })
      }
      const existing = await payload.find({
        collection: 'links',
        where: {
          or: queryConditions,
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })

      if (existing.totalDocs > 0) {
        console.log(`Skipping duplicate found in database: ${finalUrl}`)
        continue
      }

      await payload.create({
        collection: 'links',
        data: {
          title: item.aiTitle,
          url: finalUrl,
          description: item.description || '',
          nsfw: item.nsfw,
          type: finalType,
          feed: 'main',
          user: agentUser.id,
          _status: 'draft',
          aiScore: item.score,
          aiReason: item.aiReason,
          source: item.source,
        },
        overrideAccess: true,
      })

      savedUrls.add(finalUrl)
      if (finalYoutubeId) {
        savedYoutubeIds.add(finalYoutubeId)
      }

      console.log(`[ADDED DRAFT] ${item.aiTitle} (Score: ${item.score}, Type: ${finalType})`)
      addedCount++
    } catch (error) {
      console.error(`Failed to add link ${item.url}:`, error)
    }
  }

  console.log(`Finished. Added ${addedCount} draft links.`)
}

// If running directly
if (path.resolve(__filename) === path.resolve(process.argv[1] ?? '')) {
  discoverLinks()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
