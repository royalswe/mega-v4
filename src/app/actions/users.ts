'use server'

import { getAuthenticatedUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function uploadMedia(formData: FormData) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to upload media')
  }

  const file = formData.get('file') as File
  if (!file) {
    throw new Error('No file provided')
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  try {
    const media = await payload.create({
      collection: 'media',
      data: {
        alt: `Avatar for ${user.username}`,
      },
      file: {
        data: buffer,
        name: file.name,
        mimetype: file.type,
        size: file.size,
      },
    })

    return media
  } catch (error) {
    console.error('Error uploading media:', error)
    throw new Error('Failed to upload media')
  }
}

export async function updateUserAvatar(mediaId: number) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to update profile')
  }

  await payload.update({
    collection: 'users',
    id: user.id,
    data: {
      avatar: mediaId,
    },
  })

  revalidatePath('/user/[username]', 'page')
  revalidatePath('/', 'layout')
}
