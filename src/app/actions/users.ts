'use server'

import { getAuthenticatedUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function uploadMedia(formData: FormData) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to upload media')
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    throw new Error('No file provided')
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
  if (!allowedMimeTypes.includes(file.type)) {
    throw new Error('Invalid file type. Only images are allowed.')
  }

  const maxSize = 5 * 1024 * 1024 // 5MB
  if (file.size > maxSize) {
    throw new Error('File size exceeds the 5MB limit.')
  }

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

  try {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        avatar: mediaId,
      },
    })
  } catch (error) {
    console.error('Error updating user avatar:', {
      error,
      userId: user.id,
      mediaId,
    })
    throw new Error('Failed to update user avatar. Please try again later.')
  }

  revalidatePath('/user/[username]', 'page')
  revalidatePath('/', 'layout')
}
