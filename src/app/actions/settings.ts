'use server'

import { getAuthenticatedUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function toggleNSFW(enabled: boolean) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to update settings')
  }

  await payload.update({
    collection: 'users',
    id: user.id,
    data: {
      settings: {
        nsfw: enabled,
      },
    },
  })

  revalidatePath('/', 'layout')
}
