import { NextResponse } from 'next/server'
import { assertSafeUrl, fetchWithSafeRedirects } from '@/app/api/_utils/safe-fetch'
import { fetchProviderPreview, getEmbedType } from '@/lib/media'

export const dynamic = 'force-dynamic'

function extractMetadata(html: string) {
  // extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : ''

  const getMeta = (nameOrProperty: string) => {
    // Search both property="..." content="..." and content="..." property="..."
    const regex1 = new RegExp(
      `<meta[^>]+(?:name|property)=["']${nameOrProperty}["'][^>]+content=["']([^"']+)["']`,
      'i',
    )
    let match = html.match(regex1)
    if (match) return match[1]

    const regex2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${nameOrProperty}["']`,
      'i',
    )
    match = html.match(regex2)
    return match ? match[1] : ''
  }

  const ogTitle = getMeta('og:title') || getMeta('twitter:title') || title
  const ogDesc =
    getMeta('description') || getMeta('og:description') || getMeta('twitter:description') || ''
  const ogImage = getMeta('og:image') || getMeta('twitter:image') || ''

  // clean content
  let cleanHtml = html
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
    .replace(/<header[^>]*>([\s\S]*?)<\/header>/gi, '')
    .replace(/<footer[^>]*>([\s\S]*?)<\/footer>/gi, '')
    .replace(/<nav[^>]*>([\s\S]*?)<\/nav>/gi, '')
    .replace(/<iframe[^>]*>([\s\S]*?)<\/iframe>/gi, '')

  // Find paragraphs
  const pMatches = cleanHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || []
  const paragraphs = pMatches
    .map((p) => {
      return p
        .replace(/<[^>]+>/g, '') // strip HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim()
    })
    .filter((text) => text.length > 40)

  const readerText = paragraphs.slice(0, 10).join('\n\n')

  return {
    title: ogTitle,
    description: ogDesc,
    image: ogImage,
    readerText,
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  try {
    const parsedUrl = new URL(url)
    await assertSafeUrl(parsedUrl)

    const resolution = getEmbedType(parsedUrl.toString())
    if (resolution.type === 'youtube' || resolution.type === 'vimeo') {
      const preview = await fetchProviderPreview(parsedUrl.toString())
      if (!preview) {
        throw new Error('Unable to load provider metadata')
      }

      return NextResponse.json(
        {
          embeddable: false,
          xFrameOptions: 'provider-metadata',
          csp: '',
          title: preview.title,
          description: preview.description || '',
          image: preview.image || preview.thumbnailUrl || '',
          thumbnailUrl: preview.thumbnailUrl || preview.image || '',
          readerText: '',
          provider: preview.provider,
          providerName: preview.providerName,
          authorName: preview.authorName,
          canonicalUrl: preview.canonicalUrl,
        },
        {
          headers: {
            'Cache-Control': 'public, max-age=3600',
          },
        },
      )
    }

    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 4000) // 4s timeout

    const res = await fetchWithSafeRedirects(parsedUrl.toString(), {
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

    const xFrameOptions = res.headers.get('x-frame-options') || ''
    const csp = res.headers.get('content-security-policy') || ''

    const hasXFrame = /deny|sameorigin/i.test(xFrameOptions)
    const hasCSP = /frame-ancestors/i.test(csp)
    const embeddable = !hasXFrame && !hasCSP

    // Only successful pages are considered for embedding metadata extraction.
    let metadata = { title: '', description: '', image: '', readerText: '' }
    if (!embeddable) {
      const html = await res.text()
      metadata = extractMetadata(html)
    }

    return NextResponse.json(
      {
        embeddable,
        xFrameOptions,
        csp,
        ...metadata,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600',
        },
      },
    )
  } catch (err: any) {
    console.error('Error checking embeddability for url:', url, err)

    // Fall back safely if the site blocks fetch or times out
    let fallbackTitle = ''
    try {
      fallbackTitle = new URL(url).hostname
    } catch {
      fallbackTitle = 'External Website'
    }

    return NextResponse.json({
      embeddable: false,
      error: err.message || 'Failed to fetch',
      title: fallbackTitle,
      description: 'Click below to open this website directly.',
      image: '',
      thumbnailUrl: '',
      readerText: '',
    })
  }
}
