import { getHistoricalUrls, getHistoricalYoutubeIds } from '../historicalData'
import type { Candidate } from '../sources'
import type { BasePayload } from 'payload'

export async function filterDuplicates(
  candidates: Candidate[],
  payload: BasePayload,
): Promise<Candidate[]> {
  const historicalUrls = getHistoricalUrls()
  const historicalYoutubeIds = getHistoricalYoutubeIds()

  const filteredCandidates: Candidate[] = []
  const urlsToCheck = new Set<string>()
  for (const candidate of candidates) {
    // Check historical data
    if (historicalUrls.has(candidate.url)) continue
    if (candidate.youtubeId && historicalYoutubeIds.has(candidate.youtubeId)) continue

    filteredCandidates.push(candidate)
    urlsToCheck.add(candidate.url)
    if (candidate.youtubeId) urlsToCheck.add(candidate.youtubeId)
  }

  const existingUrls = new Set<string>()
  if (urlsToCheck.size > 0) {
    const { docs } = await payload.find({
      collection: 'links',
      where: {
        url: {
          in: Array.from(urlsToCheck),
        },
      },
      limit: urlsToCheck.size,
      depth: 0,
      select: {
        url: true,
      },
    })

    for (const doc of docs) {
      if (doc.url) existingUrls.add(doc.url)
    }
  }

  const uniqueCandidates: Candidate[] = []

  // Local cache of URLs/YouTube IDs we've already accepted in this batch
  const seenInBatch = new Set<string>()

  for (const candidate of filteredCandidates) {
    if (seenInBatch.has(candidate.url)) continue
    if (existingUrls.has(candidate.url)) continue
    if (candidate.youtubeId && existingUrls.has(candidate.youtubeId)) continue

    if (candidate.youtubeId && seenInBatch.has(candidate.youtubeId)) continue

    uniqueCandidates.push(candidate)
    seenInBatch.add(candidate.url)
    if (candidate.youtubeId) seenInBatch.add(candidate.youtubeId)
  }

  return uniqueCandidates
}
