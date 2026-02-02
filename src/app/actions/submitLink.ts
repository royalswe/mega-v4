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

  await payload.create({
    collection: 'links',
    data: {
      ...values,
      user: user.id,
      status: 'pending',
    },
    draft: true,
  })

  revalidatePath('/')
  revalidatePath('/submitted')
}
