import { assertSafeUrl } from '@/app/api/_utils/safe-fetch'
import { fetchProviderPreview, getEmbedType } from '@/lib/media'

const MAX_SCAN_BYTES = 300_000

export type MediaSuggestion = {
  url: string
  title?: string
  description?: string
  thumbnailUrl?: string
  provider?: 'youtube' | 'vimeo' | 'image'
}

function getMetaAll(html: string, nameOrProperty: string): string[] {
  const results: string[] = []
  const htmlToScan = html.slice(0, MAX_SCAN_BYTES)

  // Regex to find all meta tags
  const metaRegex = /<meta\s+[^>]*>/gi
  let match
  while ((match = metaRegex.exec(htmlToScan)) !== null) {
    const metaTag = match[0]

    // Check if this meta tag matches nameOrProperty
    const isTarget = new RegExp(`(?:name|property)=["']${nameOrProperty}["']`, 'i').test(metaTag)
    if (isTarget) {
      const contentMatch = metaTag.match(/content=["']([^"']+)["']/i)
      if (contentMatch && contentMatch[1]) {
        results.push(contentMatch[1])
      }
    }
  }

  return results
}

async function resolveVideoSuggestion(candidateUrl: string): Promise<MediaSuggestion | null> {
  const embedInfo = getEmbedType(candidateUrl)
  if (embedInfo.type !== 'youtube' && embedInfo.type !== 'vimeo') {
    return null
  }

  const preview = await fetchProviderPreview(candidateUrl)
  if (!preview) {
    return null
  }

  return {
    url: preview.canonicalUrl,
    title: preview.title,
    description: preview.description,
    thumbnailUrl: preview.thumbnailUrl || preview.image,
    provider: preview.provider,
  }
}

async function findVideoUrls(html: string): Promise<MediaSuggestion[]> {
  const suggestions = new Map<string, MediaSuggestion>()
  const htmlToScan = html.slice(0, MAX_SCAN_BYTES)

  // 1. OG video tags
  const ogVideoKeys = ['og:video', 'og:video:url', 'og:video:secure_url']
  for (const key of ogVideoKeys) {
    for (const url of getMetaAll(html, key)) {
      const resolved = await resolveVideoSuggestion(url)
      if (resolved) {
        suggestions.set(resolved.url, resolved)
      }
    }
  }

  // 2. Scan all href/src attributes in the HTML for YouTube/Vimeo links
  const hrefSrcRegex = /(?:href|src)=["']([^"']+)["']/gi
  let match
  while ((match = hrefSrcRegex.exec(htmlToScan)) !== null) {
    const linkUrl = match[1]
    if (linkUrl) {
      // Check YouTube pattern (fixed regex escape [^"&?/\s])
      const ytMatch = linkUrl.match(
        /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i,
      )
      if (ytMatch) {
        const resolved = await resolveVideoSuggestion(
          `https://www.youtube.com/watch?v=${ytMatch[1]}`,
        )
        if (resolved) {
          suggestions.set(resolved.url, resolved)
        }
      }
      // Check Vimeo pattern
      const vimeoMatch = linkUrl.match(/vimeo\.com\/(?:video\/)?([0-9]+)/i)
      if (vimeoMatch) {
        const resolved = await resolveVideoSuggestion(`https://vimeo.com/${vimeoMatch[1]}`)
        if (resolved) {
          suggestions.set(resolved.url, resolved)
        }
      }
    }
  }

  // 3. General page regex fallback for raw YouTube links not inside quotes
  const ytRegexFallback =
    /(?:https?:)?\/\/(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s\s]{11})/gi
  let matchFallback
  while ((matchFallback = ytRegexFallback.exec(htmlToScan)) !== null) {
    if (matchFallback[0]) {
      const resolved = await resolveVideoSuggestion(matchFallback[0].replace(/&amp;/g, '&'))
      if (resolved) {
        suggestions.set(resolved.url, resolved)
      }
    }
  }

  return Array.from(suggestions.values())
}

function findImageUrls(html: string, baseUrl: string): MediaSuggestion[] {
  const suggestions = new Set<string>()
  const htmlToScan = html.slice(0, MAX_SCAN_BYTES)

  // 1. OG / Twitter Image tags
  const ogImgKeys = ['og:image', 'twitter:image']
  for (const key of ogImgKeys) {
    getMetaAll(html, key).forEach((url) => {
      if (url) suggestions.add(url)
    })
  }

  // 2. Standard image source tags
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi
  let match
  while ((match = imgRegex.exec(htmlToScan)) !== null) {
    const imgSrc = match[1]
    if (imgSrc) {
      if (imgSrc.startsWith('http')) {
        suggestions.add(imgSrc)
      } else if (imgSrc.startsWith('/')) {
        try {
          const origin = new URL(baseUrl).origin
          suggestions.add(origin + imgSrc)
        } catch {}
      }
    }
  }

  // Filter to keep urls with actual image file extensions
  const validImages = Array.from(suggestions).filter((url) =>
    /\.(jpeg|jpg|gif|png|webp|svg)/i.test(url),
  )

  return validImages.slice(0, 5).map((url) => ({
    url,
    thumbnailUrl: url,
    provider: 'image',
  }))
}

export async function scrapeMedia(url: string, type: 'video' | 'image') {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), 6000)

  try {
    let currentUrl = new URL(url)
    let response: Response | null = null

    for (let hop = 0; hop <= 5; hop++) {
      const host = currentUrl.hostname.toLowerCase()
      if (host === 'reddit.com' || host === 'www.reddit.com') {
        currentUrl.hostname = 'old.reddit.com'
      }

      await assertSafeUrl(currentUrl)

      const res = await fetch(currentUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        redirect: 'manual',
        signal: controller.signal,
      })

      const isRedirect = res.status >= 300 && res.status < 400
      if (!isRedirect) {
        response = res
        break
      }

      const location = res.headers.get('location')
      if (!location) {
        throw new Error('Redirect response missing location header')
      }

      currentUrl = new URL(location, currentUrl)
    }

    if (!response) {
      throw new Error('Too many redirects')
    }

    clearTimeout(id)

    if (!response.ok) {
      throw new Error(`Failed to fetch page status ${response.status}`)
    }

    const html = await response.text()
    const suggestions =
      type === 'video' ? await findVideoUrls(html) : findImageUrls(html, currentUrl.toString())

    return {
      success: true,
      suggestions: suggestions.map((item) => item.url),
      suggestionDetails: suggestions,
    }
  } catch (err: unknown) {
    clearTimeout(id)
    console.error('Error scraping media for url:', url, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Scrape request failed',
      suggestions: [] as string[],
      suggestionDetails: [] as MediaSuggestion[],
    }
  }
}
