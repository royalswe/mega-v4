'use server'

import { getAuthenticatedUser } from '@/lib/auth'
import { checkRole } from '@/access/checkRole'
import { revalidatePath } from 'next/cache'

type AutomaticRole = 'uploader' | 'editor' | 'moderator' | 'cleaner' | 'recruiter'

const AUTOMATIC_ROLES: AutomaticRole[] = ['uploader', 'editor', 'moderator', 'cleaner', 'recruiter']

export async function uploadMedia(formData: FormData) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to upload media')
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    throw new Error('No file provided')
  }

  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
  if (!allowedMimeTypes.includes(file.type)) {
    throw new Error('Invalid file type. Only images are allowed.')
  }

  const maxSize = 5 * 1024 * 1024 // 5MB
  if (file.size > maxSize) {
    throw new Error('File size exceeds the 5MB limit.')
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const withAccess = {
    user,
    overrideAccess: false as const,
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
      ...withAccess,
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

  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  // Verify the media exists and belongs to the current user
  const media = await payload.findByID({
    collection: 'media',
    id: mediaId,
    ...withAccess,
  })

  if (!media) {
    throw new Error('Media not found')
  }

  try {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        avatar: mediaId,
      },
      ...withAccess,
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

export async function setStandingLock(userId: number, locked: boolean) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user || !checkRole(['admin'], user)) {
    throw new Error('Only administrators can freeze community standing')
  }

  await payload.update({
    collection: 'users',
    id: userId,
    data: {
      standingLocked: locked,
    },
    user,
    overrideAccess: false,
  })

  revalidatePath('/user/[username]', 'page')
  revalidatePath('/', 'layout')
}

export async function revokeAutomaticRole(userId: number, role: AutomaticRole, revoke: boolean) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user || !checkRole(['admin'], user)) {
    throw new Error('Only administrators can revoke community roles')
  }

  if (!AUTOMATIC_ROLES.includes(role)) {
    throw new Error('Invalid automatic role')
  }

  const target = await payload.findByID({
    collection: 'users',
    id: userId,
    user,
    overrideAccess: false,
  })

  if (!target) {
    throw new Error('User not found')
  }

  const current = new Set<AutomaticRole>(
    Array.isArray(target.revokedRoles) ? (target.revokedRoles as AutomaticRole[]) : [],
  )

  if (revoke) {
    current.add(role)
  } else {
    current.delete(role)
  }

  await payload.update({
    collection: 'users',
    id: userId,
    data: {
      revokedRoles: Array.from(current),
    },
    user,
    overrideAccess: false,
  })

  revalidatePath('/user/[username]', 'page')
  revalidatePath('/', 'layout')
}
