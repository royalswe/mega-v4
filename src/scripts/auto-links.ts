import { type Payload, getPayload } from 'payload'
import configPromise from '@payload-config'
import { getEmbedType } from '../lib/media'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const HISTORICAL_DATA_PATH = path.resolve(__dirname, '../../existenz-links.json')
const AGENT_EMAIL = 'agent@existenz.se'
const AGENT_USERNAME = 'auto-agent'

interface Source {
  name: string
  url: string
  type: 'reddit' | 'youtube' | 'rss'
  prefix?: string
}

const SOURCES: Source[] = [
  {
    name: 'funny',
    url: 'https://www.reddit.com/r/funny/hot/.rss',
    type: 'reddit',
    prefix: 'Humor: ',
  },
  {
    name: 'PublicFreakout',
    url: 'https://www.reddit.com/r/PublicFreakout/hot/.rss',
    type: 'reddit',
    prefix: 'Freakout: ',
  },
  {
    name: 'Whatcouldgowrong',
    url: 'https://www.reddit.com/r/Whatcouldgowrong/hot/.rss',
    type: 'reddit',
    prefix: 'Freakout: ',
  },
  {
    name: 'Unexpected',
    url: 'https://www.reddit.com/r/Unexpected/hot/.rss',
    type: 'reddit',
    prefix: 'Oväntat: ',
  },
  {
    name: 'YouTube Trending',
    url: 'https://www.youtube.com/feeds/videos.xml?chart=mostPopular&region=SE',
    type: 'youtube',
    prefix: 'YouTube: ',
  },
  {
    name: 'nextfuckinglevel',
    url: 'https://www.reddit.com/r/nextfuckinglevel/hot/.rss',
    type: 'reddit',
    prefix: 'Intressant: ',
  },
  {
    name: 'interestingasfuck',
    url: 'https://www.reddit.com/r/interestingasfuck/hot/.rss',
    type: 'reddit',
    prefix: 'Intressant: ',
  },
  {
    name: 'therewasanattempt',
    url: 'https://www.reddit.com/r/therewasanattempt/hot/.rss',
    type: 'reddit',
    prefix: 'Försök: ',
  },
  {
    name: 'CrazyFuckingVideos',
    url: 'https://www.reddit.com/r/crazyfuckingvideos/hot/.rss',
    type: 'reddit',
    prefix: 'Galen: ',
  },
]

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
      password:
        process.env.AGENT_PASSWORD ||
        (() => {
          throw new Error('AGENT_PASSWORD environment variable is required')
        })(),
      roles: ['user', 'uploader'],
      settings: {
        nsfw: true,
        language: 'sv',
      },
    },
    overrideAccess: true,
  })
}

function extractYoutubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
  )
  return match ? match[1] : null
}

async function loadHistoricalLinks() {
  if (!fs.existsSync(HISTORICAL_DATA_PATH)) {
    return { urls: new Set<string>(), youtubeIds: new Set<string>() }
  }
  const data = JSON.parse(fs.readFileSync(HISTORICAL_DATA_PATH, 'utf-8'))
  const urls = new Set<string>()
  const youtubeIds = new Set<string>()
  for (const day of data) {
    for (const link of day.links) {
      if (link.src) {
        if (link.type === 'youtube') {
          youtubeIds.add(link.src)
          urls.add(`https://www.youtube.com/watch?v=${link.src}`)
        } else {
          urls.add(link.src)
          const yid = extractYoutubeId(link.src)
          if (yid) youtubeIds.add(yid)
        }
      }
    }
  }
  return { urls, youtubeIds }
}

function decodeHtml(html: string): string {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function getXmlBlocks(xml: string, tag: 'entry' | 'item'): string[] {
  const blockRegex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g')
  return Array.from(xml.matchAll(blockRegex), (match) => match[1] || '')
}

function parseBasicBlocks(
  blocks: string[],
  titleRegex: RegExp,
  urlRegex: RegExp,
): { title: string; url: string; nsfw: false }[] {
  const entries: { title: string; url: string; nsfw: false }[] = []

  for (const content of blocks) {
    const title = decodeHtml(content.match(titleRegex)?.[1] || '')
    const url = content.match(urlRegex)?.[1] || ''
    entries.push({ title, url, nsfw: false })
  }

  return entries
}

async function fetchSource(source: Source) {
  try {
    const response = await fetch(source.url, {
      headers: {
        'User-Agent': 'existenz-auto-links/1.0.0 (by /u/existenz_se)',
      },
    })
    if (!response.ok) {
      console.error(`Failed to fetch ${source.name}: ${response.status} ${response.statusText}`)
      return []
    }
    const xml = await response.text()
    const entries: { title: string; url: string; nsfw: boolean }[] = []

    if (source.type === 'reddit') {
      const entryBlocks = getXmlBlocks(xml, 'entry')
      for (const content of entryBlocks) {
        const title = decodeHtml(content.match(/<title>(.*?)<\/title>/)?.[1] || '')
        const permalink = content.match(/<link href="(.*?)"/)?.[1] || ''
        const contentHtml = decodeHtml(
          content.match(/<content type="html">([\s\S]*?)<\/content>/)?.[1] || '',
        )
        const url =
          contentHtml.match(/<span><a href="(.*?)">\[link\]<\/a><\/span>/)?.[1] || permalink
        entries.push({
          title,
          url,
          nsfw: content.includes('nsfw') || title.toLowerCase().includes('nsfw'),
        })
      }
    } else if (source.type === 'youtube') {
      entries.push(
        ...parseBasicBlocks(
          getXmlBlocks(xml, 'entry'),
          /<title>(.*?)<\/title>/,
          /<link rel="alternate" href="(.*?)"/,
        ),
      )
    } else {
      // Generic RSS (item tags instead of entry)
      entries.push(
        ...parseBasicBlocks(getXmlBlocks(xml, 'item'), /<title>(.*?)<\/title>/, /<link>(.*?)<\/link>/),
      )

      // If no items, try standard Atom <entry>
      if (entries.length === 0) {
        entries.push(
          ...parseBasicBlocks(
            getXmlBlocks(xml, 'entry'),
            /<title.*?>(.*?)<\/title>/,
            /<link.*?href="(.*?)"/,
          ),
        )
      }
    }
    return entries
  } catch (error) {
    console.error(`Error fetching ${source.name}:`, error)
    return []
  }
}

function cleanTitle(title: string): string {
  return title
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/&amp;/g, '&')
    .trim()
}

async function main() {
  const payload = await getPayload({ config: configPromise })
  const agentUser = await getAgentUser(payload)
  const { urls: historicalUrls, youtubeIds: historicalYoutubeIds } = await loadHistoricalLinks()

  console.log(`Using agent user: ${agentUser.username} (${agentUser.id})`)
  console.log(
    `Loaded ${historicalUrls.size} historical URLs and ${historicalYoutubeIds.size} YouTube IDs`,
  )

  let addedCount = 0
  const totalTargetCount = 20
  const perSourceLimit = 3

  for (const source of SOURCES) {
    if (addedCount >= totalTargetCount) break

    console.log(`Fetching from ${source.name}...`)
    const items = await fetchSource(source)
    let sourceAddedCount = 0

    for (const item of items) {
      if (addedCount >= totalTargetCount || sourceAddedCount >= perSourceLimit) break

      const originalUrl = item.url
      const yid = extractYoutubeId(originalUrl)
      const normalizedUrl = yid ? `https://www.youtube.com/watch?v=${yid}` : originalUrl

      // De-duplication
      if (historicalUrls.has(normalizedUrl)) continue
      if (yid && historicalYoutubeIds.has(yid)) continue

      const { totalDocs: existingCount } = await payload.count({
        collection: 'links',
        where: {
          or: yid
            ? [{ url: { equals: normalizedUrl } }, { youtubeId: { equals: yid } }]
            : [{ url: { equals: normalizedUrl } }],
        },
      })

      if (existingCount > 0) continue

      try {
        const cleanedTitle = cleanTitle(item.title)
        let finalTitle = `${source.prefix || ''}${cleanedTitle}`
        if (finalTitle.length > 100) finalTitle = finalTitle.substring(0, 97) + '...'

        let finalUrl = normalizedUrl
        const embedType = getEmbedType(originalUrl)
        let linkType: 'video' | 'image' | 'article' = 'article'

        if (['youtube', 'vimeo', 'video'].includes(embedType.type)) {
          linkType = 'video'
        } else if (embedType.type === 'image') {
          linkType = 'image'
        }

        if (yid) {
          linkType = 'video'
        }

        await payload.create({
          collection: 'links',
          data: {
            title: finalTitle,
            url: finalUrl,
            description: '',
            nsfw: item.nsfw || false,
            type: linkType,
            feed: 'main',
            user: agentUser.id,
            _status: 'published',
          },
          overrideAccess: true,
        })
        console.log(`[ADDED] ${finalTitle} (${finalUrl})`)
        addedCount++
        sourceAddedCount++
      } catch (error) {
        console.error(`Failed to add link ${item.url}:`, error)
      }
    }
  }

  console.log(`Finished. Added ${addedCount} links.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
