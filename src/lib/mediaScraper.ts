import { assertSafeUrl } from '@/app/api/_utils/safe-fetch'
import { fetchProviderPreview, getEmbedType } from '@/lib/media'

const MAX_SCAN_BYTES = 10_000_000

type MediaSuggestion = {
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
  const candidateUrls = new Set<string>()
  const suggestions = new Map<string, MediaSuggestion>()
  const htmlToScan = html.slice(0, MAX_SCAN_BYTES)

  // 1. OG video tags
  const ogVideoKeys = ['og:video', 'og:video:url', 'og:video:secure_url']
  for (const key of ogVideoKeys) {
    for (const url of getMetaAll(html, key)) {
      if (url) candidateUrls.add(url)
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
        candidateUrls.add(`https://www.youtube.com/watch?v=${ytMatch[1]}`)
      }
      // Check Vimeo pattern
      const vimeoMatch = linkUrl.match(/vimeo\.com\/(?:video\/)?([0-9]+)/i)
      if (vimeoMatch) {
        candidateUrls.add(`https://vimeo.com/${vimeoMatch[1]}`)
      }
    }
  }

  // 3. General page regex fallback for raw YouTube links not inside quotes
  const ytRegexFallback =
    /(?:https?:)?\/\/(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s\s]{11})/gi
  let matchFallback
  while ((matchFallback = ytRegexFallback.exec(htmlToScan)) !== null) {
    if (matchFallback[0]) {
      candidateUrls.add(matchFallback[0].replace(/&amp;/g, '&'))
    }
  }

  for (const candidateUrl of candidateUrls) {
    const resolved = await resolveVideoSuggestion(candidateUrl)
    if (resolved) {
      suggestions.set(resolved.url, resolved)
    }
  }

  return Array.from(suggestions.values())
}

function findImageUrls(html: string, baseUrl: string): MediaSuggestion[] {
  const providerDeclaredImages = new Set<string>()
  const domImages = new Set<string>()
  const htmlToScan = html.slice(0, MAX_SCAN_BYTES)

  // 1. OG / Twitter Image tags
  const ogImgKeys = ['og:image', 'twitter:image']
  for (const key of ogImgKeys) {
    getMetaAll(html, key).forEach((url) => {
      if (url) providerDeclaredImages.add(url)
    })
  }

  // 2. Standard image source tags
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi
  let match
  while ((match = imgRegex.exec(htmlToScan)) !== null) {
    const imgSrc = match[1]
    if (imgSrc) {
      if (imgSrc.startsWith('http')) {
        domImages.add(imgSrc)
      } else if (imgSrc.startsWith('/')) {
        try {
          const origin = new URL(baseUrl).origin
          domImages.add(origin + imgSrc)
        } catch {}
      }
    }
  }

  // Keep provider-declared images as-is, but extension-filter DOM-scraped <img> sources.
  const validImages = new Set<string>(providerDeclaredImages)
  for (const url of domImages) {
    if (/\.(jpeg|jpg|gif|png|webp|svg)/i.test(url)) {
      validImages.add(url)
    }
  }

  return Array.from(validImages)
    .slice(0, 5)
    .map((url) => ({
      url,
      thumbnailUrl: url,
      provider: 'image',
    }))
}

async function readResponseTextCapped(response: Response, maxBytes: number): Promise<string> {
  const contentLengthHeader = response.headers.get('content-length')
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10)
    if (Number.isFinite(contentLength) && contentLength <= 0) {
      return ''
    }
  }

  if (!response.body) {
    return ''
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    const remaining = maxBytes - bytesRead
    if (remaining <= 0) {
      await reader.cancel()
      break
    }

    if (value.byteLength <= remaining) {
      text += decoder.decode(value, { stream: true })
      bytesRead += value.byteLength
      continue
    }

    // Keep a safe partial read budget and stop once reached.
    text += decoder.decode(value.subarray(0, remaining), { stream: true })
    bytesRead += remaining
    await reader.cancel()
    break
  }

  text += decoder.decode()
  return text
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

    if (!response.ok) {
      throw new Error(`Failed to fetch page status ${response.status}`)
    }

    const html = await readResponseTextCapped(response, MAX_SCAN_BYTES)
    const suggestions =
      type === 'video' ? await findVideoUrls(html) : findImageUrls(html, currentUrl.toString())

    return {
      success: true,
      suggestions: suggestions.map((item) => item.url),
      suggestionDetails: suggestions,
    }
  } catch (err: unknown) {
    console.error('Error scraping media for url:', url, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Scrape request failed',
      suggestions: [] as string[],
      suggestionDetails: [] as MediaSuggestion[],
    }
  } finally {
    clearTimeout(id)
  }
}
