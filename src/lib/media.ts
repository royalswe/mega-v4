export type MediaKind = 'youtube' | 'vimeo' | 'image' | 'video' | 'audio' | 'iframe'

export interface MediaResolution {
  type: MediaKind
  provider?: 'youtube' | 'vimeo'
  videoId?: string
  canonicalUrl?: string
}

export interface ProviderPreview {
  provider: 'youtube' | 'vimeo'
  providerName?: string
  authorName?: string
  canonicalUrl: string
  title: string
  description?: string
  thumbnailUrl?: string
  image?: string
}

export function getEmbedType(url: string): MediaResolution {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const watchId = parsed.searchParams.get('v')
      if (watchId && watchId.length === 11) {
        return {
          type: 'youtube',
          provider: 'youtube',
          videoId: watchId,
          canonicalUrl: `https://www.youtube.com/watch?v=${watchId}`,
        }
      }

      const pathMatch = parsed.pathname.match(/^\/(?:embed|v|e)\/([A-Za-z0-9_-]{11})/)
      if (pathMatch) {
        return {
          type: 'youtube',
          provider: 'youtube',
          videoId: pathMatch[1],
          canonicalUrl: `https://www.youtube.com/watch?v=${pathMatch[1]}`,
        }
      }

      const shortsMatch = parsed.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/)
      if (shortsMatch) {
        return {
          type: 'youtube',
          provider: 'youtube',
          videoId: shortsMatch[1],
          canonicalUrl: `https://www.youtube.com/watch?v=${shortsMatch[1]}`,
        }
      }
    }

    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1)
      if (id.length >= 11) {
        const videoId = id.slice(0, 11)
        return {
          type: 'youtube',
          provider: 'youtube',
          videoId,
          canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        }
      }
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const vimeoMatch = parsed.pathname.match(/\/(?:video\/)?([0-9]+)/)
      if (vimeoMatch) {
        return {
          type: 'vimeo',
          provider: 'vimeo',
          videoId: vimeoMatch[1],
          canonicalUrl: `https://vimeo.com/${vimeoMatch[1]}`,
        }
      }
    }
  } catch {
    // Malformed URL — fall through to extension checks below.
  }

  if (/\.(jpeg|jpg|gif|png|webp|svg|bmp)(?:\?.*)?$/i.test(url)) {
    return { type: 'image' }
  }

  if (/\.(mp4|webm|ogg|ogv|mov)(?:\?.*)?$/i.test(url)) {
    return { type: 'video' }
  }

  if (/\.(mp3|wav|ogg|aac|flac|m4a)(?:\?.*)?$/i.test(url)) {
    return { type: 'audio' }
  }

  return { type: 'iframe' }
}

function getOEmbedEndpoint(resolution: MediaResolution): string | null {
  if (!resolution.canonicalUrl || !resolution.provider) {
    return null
  }

  if (resolution.provider === 'youtube') {
    return `https://www.youtube.com/oembed?url=${encodeURIComponent(resolution.canonicalUrl)}&format=json`
  }

  return `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(resolution.canonicalUrl)}`
}

export async function fetchProviderPreview(url: string): Promise<ProviderPreview | null> {
  const resolution = getEmbedType(url)
  if (resolution.type !== 'youtube' && resolution.type !== 'vimeo') {
    return null
  }

  const provider = resolution.type
  const canonicalUrl = resolution.canonicalUrl
  if (!canonicalUrl) {
    return null
  }

  const endpoint = getOEmbedEndpoint(resolution)
  if (!endpoint) {
    return null
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as {
      title?: string
      description?: string
      thumbnail_url?: string
      author_name?: string
      provider_name?: string
    }

    if (!data.title) {
      return null
    }

    return {
      provider,
      providerName: data.provider_name,
      authorName: data.author_name,
      canonicalUrl,
      title: data.title,
      description: data.description,
      thumbnailUrl: data.thumbnail_url,
      image: data.thumbnail_url,
    }
  } catch {
    return null
  }
}
