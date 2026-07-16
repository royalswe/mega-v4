import { XMLParser } from 'fast-xml-parser'

export interface Candidate {
  title: string
  url: string
  source: string
  description?: string
  nsfw: boolean
  type: 'video' | 'image' | 'article'
  youtubeId?: string
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; existenz-bot/1.0; +https://v4.fumlig.com)',
  Accept: 'application/atom+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

const DEFAULT_RETRY_DELAY_MS = 3_000
const MAX_RETRY_DELAY_MS = 30_000
const MAX_FETCH_ATTEMPTS = 3
const MAX_RETRY_WAIT_MS = 10_000
const REQUEST_TIMEOUT_MS = 12_000

function extractYoutubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
  )
  return match ? match[1] : null
}

function decodeHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, {
      headers: REQUEST_HEADERS,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

function parseRetryAfterSeconds(value: string | null): number | null {
  if (!value) return null

  const numeric = Number(value)
  if (!Number.isNaN(numeric) && numeric >= 0) {
    return numeric
  }

  const retryDate = Date.parse(value)
  if (!Number.isNaN(retryDate)) {
    const diffMs = retryDate - Date.now()
    if (diffMs > 0) {
      return Math.ceil(diffMs / 1000)
    }
  }

  return null
}

function getRetryDelayMs(response: Response, attempt: number): number {
  const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('retry-after'))
  const rateLimitResetSeconds = Number(response.headers.get('x-ratelimit-reset'))

  if (retryAfterSeconds !== null) {
    return Math.min(retryAfterSeconds * 1_000, MAX_RETRY_DELAY_MS)
  }

  if (!Number.isNaN(rateLimitResetSeconds) && rateLimitResetSeconds > 0) {
    return Math.min(Math.ceil(rateLimitResetSeconds) * 1_000, MAX_RETRY_DELAY_MS)
  }

  const backoff = DEFAULT_RETRY_DELAY_MS * Math.pow(2, attempt - 1)
  return Math.min(backoff, MAX_RETRY_DELAY_MS)
}

function isLikelyXml(body: string): boolean {
  const trimmed = body.trimStart()
  return (
    trimmed.startsWith('<?xml') ||
    trimmed.startsWith('<feed') ||
    trimmed.startsWith('<rss') ||
    trimmed.startsWith('<rdf:RDF')
  )
}

async function fetchRss(url: string, sourceName: string): Promise<Candidate[]> {
  try {
    let response: Response | null = null

    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        response = await fetchWithTimeout(url)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn(
            `[${sourceName}] feed request timed out after ${Math.ceil(REQUEST_TIMEOUT_MS / 1000)}s. Skipping source for this run.`,
          )
          return []
        }

        throw error
      }

      if (response.ok) {
        break
      }

      if ([401, 403, 404].includes(response.status)) {
        console.warn(`[${sourceName}] feed request blocked with status ${response.status}.`)
        return []
      }

      const isTransient =
        response.status === 429 || response.status === 408 || response.status >= 500

      if (isTransient && attempt < MAX_FETCH_ATTEMPTS) {
        const waitMs = getRetryDelayMs(response, attempt)
        const cappedWaitMs = Math.min(waitMs, MAX_RETRY_WAIT_MS)
        console.warn(
          `[${sourceName}] transient failure (${response.status}). Retrying in ${Math.ceil(cappedWaitMs / 1000)}s (attempt ${attempt}/${MAX_FETCH_ATTEMPTS}).`,
        )
        await sleep(cappedWaitMs)
        continue
      }

      if (isTransient) {
        console.warn(
          `[${sourceName}] transient failure (${response.status}) after ${MAX_FETCH_ATTEMPTS} attempts.`,
        )
        return []
      }

      console.warn(`[${sourceName}] feed request failed with status ${response.status}.`)
      return []
    }

    if (!response || !response.ok) {
      console.warn(`[${sourceName}] unable to fetch feed after retries.`)
      return []
    }

    const xml = await response.text()
    if (!isLikelyXml(xml)) {
      console.warn(`[${sourceName}] response was not XML; skipping source.`)
      return []
    }

    const data = parser.parse(xml)

    const candidates: Candidate[] = []

    // Handle Atom (Reddit/YouTube)
    if (data.feed && data.feed.entry) {
      const entries = Array.isArray(data.feed.entry) ? data.feed.entry : [data.feed.entry]
      for (const entry of entries) {
        const title = decodeHtml(entry.title?.['#text'] || entry.title || '')
        let link = ''
        if (entry.link) {
          if (Array.isArray(entry.link)) {
            link =
              entry.link.find(
                (l: { '@_rel': string; '@_href': string }) => l['@_rel'] === 'alternate',
              )?.['@_href'] || entry.link[0]?.['@_href']
          } else {
            link = entry.link['@_href']
          }
        }

        let contentUrl = link
        if (entry.content && entry.content['#text']) {
          const contentHtml = decodeHtml(entry.content['#text'])
          const linkMatch = contentHtml.match(/<span><a href="(.*?)">\[link\]<\/a><\/span>/)
          if (linkMatch) contentUrl = linkMatch[1]
        }

        const yid = extractYoutubeId(contentUrl)

        candidates.push({
          title,
          url: yid ? `https://www.youtube.com/watch?v=${yid}` : contentUrl,
          source: sourceName,
          nsfw: xml.includes('nsfw') || title.toLowerCase().includes('nsfw'),
          type: yid
            ? 'video'
            : contentUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)
              ? 'image'
              : 'article',
          youtubeId: yid || undefined,
        })
      }
    }
    // Handle standard RSS
    else if (data.rss && data.rss.channel && data.rss.channel.item) {
      const items = Array.isArray(data.rss.channel.item)
        ? data.rss.channel.item
        : [data.rss.channel.item]
      for (const item of items) {
        const title = decodeHtml(item.title || '')
        const url = item.link || ''
        const yid = extractYoutubeId(url)

        candidates.push({
          title,
          url: yid ? `https://www.youtube.com/watch?v=${yid}` : url,
          source: sourceName,
          nsfw: title.toLowerCase().includes('nsfw'),
          type: yid ? 'video' : 'article',
          youtubeId: yid || undefined,
        })
      }
    }

    return candidates
  } catch (error) {
    console.error(`Error fetching source ${sourceName}:`, error)
    return []
  }
}

export async function collectCandidates(): Promise<Candidate[]> {
  const sources = [
    // Reddit can be rate-limited/blocked; keep as optional sources.
    { name: 'r/PublicFreakout', url: 'https://www.reddit.com/r/PublicFreakout/hot/.rss' },
    { name: 'r/Unexpected', url: 'https://www.reddit.com/r/Unexpected/hot/.rss' },
    { name: 'r/Whatcouldgowrong', url: 'https://www.reddit.com/r/Whatcouldgowrong/hot/.rss' },
    { name: 'r/therewasanattempt', url: 'https://www.reddit.com/r/therewasanattempt/hot/.rss' },
    { name: 'r/CrazyFuckingVideos', url: 'https://www.reddit.com/r/CrazyFuckingVideos/hot/.rss' },
    { name: 'r/nextfuckinglevel', url: 'https://www.reddit.com/r/nextfuckinglevel/hot/.rss' },
    { name: 'r/interestingasfuck', url: 'https://www.reddit.com/r/interestingasfuck/hot/.rss' },
    // Reliable fallback feeds.
    {
      name: 'YouTube/Veritasium',
      url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA',
    },
    { name: 'HackerNews/frontpage', url: 'https://hnrss.org/frontpage' },
    { name: 'HackerNews/newest', url: 'https://hnrss.org/newest' },
  ]

  const allCandidates: Candidate[] = []
  for (const source of sources) {
    const results = await fetchRss(source.url, source.name)
    if (results.length === 0) {
      console.warn(`[${source.name}] returned 0 candidates.`)
    }
    allCandidates.push(...results)
  }

  return allCandidates
}
