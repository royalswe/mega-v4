import { discoverLinks } from '@/jobs/discoverLinks'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')

  // Use a secret key from environment variables to protect the endpoint
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Run the job asynchronously so we don't time out the request
    // Note: Some platforms have short request timeouts. 
    // For long jobs, a better approach is a background worker, 
    // but for 20 links this should be fine.
    await discoverLinks()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Discover Links Job Failed:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
