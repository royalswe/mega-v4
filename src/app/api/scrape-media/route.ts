import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getMetaAll(html: string, nameOrProperty: string): string[] {
  const results: string[] = []

  // Regex to find all meta tags
  const metaRegex = /<meta\s+[^>]*>/gi
  let match
  while ((match = metaRegex.exec(html)) !== null) {
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

function findVideoUrls(html: string, baseUrl: string): string[] {
  const suggestions = new Set<string>()

  // 1. OG video tags
  const ogVideoKeys = ['og:video', 'og:video:url', 'og:video:secure_url']
  for (const key of ogVideoKeys) {
    getMetaAll(html, key).forEach((url) => {
      if (url) suggestions.add(url)
    })
  }

  // 2. Scan all href/src attributes in the HTML for YouTube/Vimeo links
  const hrefSrcRegex = /(?:href|src)=["']([^"']+)["']/gi
  let match
  while ((match = hrefSrcRegex.exec(html)) !== null) {
    const linkUrl = match[1]
    if (linkUrl) {
      // Check YouTube pattern (fixed regex escape [^"&?/\s])
      const ytMatch = linkUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i)
      if (ytMatch) {
        suggestions.add(`https://www.youtube.com/watch?v=${ytMatch[1]}`)
      }
      // Check Vimeo pattern
      const vimeoMatch = linkUrl.match(/vimeo\.com\/(?:video\/)?([0-9]+)/i)
      if (vimeoMatch) {
        suggestions.add(`https://vimeo.com/${vimeoMatch[1]}`)
      }
    }
  }

  // 3. General page regex fallback for raw YouTube links not inside quotes
  const ytRegexFallback = /(?:https?:)?\/\/(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s\s]{11})/gi
  let matchFallback
  while ((matchFallback = ytRegexFallback.exec(html)) !== null) {
    if (matchFallback[0]) suggestions.add(matchFallback[0].replace(/&amp;/g, '&'))
  }

  return Array.from(suggestions)
}

function findImageUrls(html: string, baseUrl: string): string[] {
  const suggestions = new Set<string>()

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
  while ((match = imgRegex.exec(html)) !== null) {
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

  return validImages.slice(0, 5) // Return up to top 5 images
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  const type = searchParams.get('type') // 'video' | 'image'

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  if (type !== 'video' && type !== 'image') {
    return NextResponse.json({ error: 'Valid type is required' }, { status: 400 })
  }

  // For Reddit, prefer old.reddit.com — it's server-rendered HTML and reliably
  // includes embedded video/YouTube links in the initial markup, unlike the
  // React-based new Reddit which requires client-side JS to populate content.
  let fetchUrl = url
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'www.reddit.com' || parsed.hostname === 'reddit.com') {
      parsed.hostname = 'old.reddit.com'
      fetchUrl = parsed.toString()
    }
  } catch {
    // ignore invalid URL, use original
  }

  try {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 4000) // 4s timeout

    const res = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
    })
    clearTimeout(id)

    if (!res.ok) {
      throw new Error(`Failed to fetch page status ${res.status}`)
    }

    const html = await res.text()
    const suggestions = type === 'video' ? findVideoUrls(html, url) : findImageUrls(html, url)

    return NextResponse.json({
      success: true,
      suggestions,
    })
  } catch (err: any) {
    console.error('Error scraping media for url:', url, err)
    return NextResponse.json({
      success: false,
      error: err.message || 'Scrape request failed',
      suggestions: [],
    })
  }
}
