import { getHistoricalUrls, getHistoricalYoutubeIds } from '../historicalData'
import type { Candidate } from '../sources'
import type { BasePayload } from 'payload'

export async function filterDuplicates(candidates: Candidate[], payload: BasePayload): Promise<Candidate[]> {
  const historicalUrls = getHistoricalUrls()
  const historicalYoutubeIds = getHistoricalYoutubeIds()

  const uniqueCandidates: Candidate[] = []
  
  // Local cache of URLs we've already seen in this batch to avoid duplicates within the batch
  const seenInBatch = new Set<string>()

  for (const candidate of candidates) {
    if (seenInBatch.has(candidate.url)) continue

    // Check historical data
    if (historicalUrls.has(candidate.url)) continue
    if (candidate.youtubeId && historicalYoutubeIds.has(candidate.youtubeId)) continue

    // Check existing Payload documents
    const { totalDocs } = await payload.count({
      collection: 'links',
      where: {
        or: [
          { url: { equals: candidate.url } },
          ...(candidate.youtubeId ? [{ url: { equals: candidate.youtubeId } }] : [])
        ]
      }
    })

    if (totalDocs === 0) {
      uniqueCandidates.push(candidate)
      seenInBatch.add(candidate.url)
    }
  }

  return uniqueCandidates
}
