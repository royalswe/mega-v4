import { NextResponse } from 'next/server'
import { scrapeMedia } from '@/lib/mediaScraper'

export const dynamic = 'force-dynamic'

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

  const result = await scrapeMedia(url, type)

  return NextResponse.json(result)
}
