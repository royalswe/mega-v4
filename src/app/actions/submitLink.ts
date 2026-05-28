'use server'
import { revalidatePath } from 'next/cache'
import { getAuthenticatedUser } from '@/lib/auth'

export async function submitLink(values: {
  title: string
  url: string
  description?: string
  nsfw?: boolean
  type?: 'article' | 'video' | 'image' | 'audio' | 'game'
}) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to submit a link')
  }

  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  await payload.create({
    collection: 'links',
    data: {
      ...values,
      user: user.id,
      feed: 'main',
    },
    draft: true,
    ...withAccess,
  })

  revalidatePath('/')
  revalidatePath('/submitted')
}
