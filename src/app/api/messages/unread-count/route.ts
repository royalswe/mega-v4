import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { user, payload } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ count: 0 })
    }

    const { totalDocs: count } = await payload.count({
      collection: 'private-messages',
      where: {
        and: [
          { receiver: { equals: user.id } },
          { isRead: { equals: false } },
        ],
      },
      user,
      overrideAccess: false,
    })

    return NextResponse.json({ count })
  } catch (error) {
    console.error('Error fetching unread count:', error)
    return NextResponse.json({ count: 0 }, { status: 500 })
  }
}
