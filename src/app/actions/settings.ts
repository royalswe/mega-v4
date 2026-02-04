'use server'

import type { User } from '@/payload-types'
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

export async function updateLanguage(lang: User['settings']['language']) {
  const { user, payload } = await getAuthenticatedUser()
  if (user) {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        settings: {
          language: lang,
        },
      },
    })
  }

  // We rely on the client component to set the cookie for immediate feedback
  // but we could also strictly enforce it here if we wanted to be server-only.
  // For now, the client-side cookie set is sufficient for the session.
  revalidatePath('/', 'layout')
}
