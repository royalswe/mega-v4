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

  await payload.create({
    collection: 'links',
    data: {
      ...values,
      user: user.id,
    },
    draft: true,
  })

  revalidatePath('/')
  revalidatePath('/submitted')
}
