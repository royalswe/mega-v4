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

  if (!user) {
    // Guest users rely on client-side cookie; no server-side persistence needed
    revalidatePath('/', 'layout')
    return
  }

  await payload.update({
    collection: 'users',
    id: user.id,
    data: {
      settings: {
        language: lang,
      },
    },
  })

  revalidatePath('/', 'layout')
}
