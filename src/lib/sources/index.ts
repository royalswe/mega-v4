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

async function fetchRss(url: string, sourceName: string): Promise<Candidate[]> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'existenz-bot/1.0.0 (by /u/existenz_se)',
      },
    })
    if (!response.ok) return []
    const xml = await response.text()
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
          url: yid || contentUrl,
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
          url: yid || url,
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
    { name: 'r/PublicFreakout', url: 'https://www.reddit.com/r/PublicFreakout/hot/.rss' },
    { name: 'r/Unexpected', url: 'https://www.reddit.com/r/Unexpected/hot/.rss' },
    { name: 'r/funny', url: 'https://www.reddit.com/r/funny/hot/.rss' },
    { name: 'r/Whatcouldgowrong', url: 'https://www.reddit.com/r/Whatcouldgowrong/hot/.rss' },
    { name: 'r/therewasanattempt', url: 'https://www.reddit.com/r/therewasanattempt/hot/.rss' },
    { name: 'r/CrazyFuckingVideos', url: 'https://www.reddit.com/r/CrazyFuckingVideos/hot/.rss' },
    { name: 'r/nextfuckinglevel', url: 'https://www.reddit.com/r/nextfuckinglevel/hot/.rss' },
    { name: 'r/interestingasfuck', url: 'https://www.reddit.com/r/interestingasfuck/hot/.rss' },
    // Some popular YouTube channels instead of trending feed
  ]

  const allCandidates: Candidate[] = []
  for (const source of sources) {
    const results = await fetchRss(source.url, source.name)
    allCandidates.push(...results)
  }

  return allCandidates
}
