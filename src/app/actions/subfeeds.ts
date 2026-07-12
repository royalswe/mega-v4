'use server'

import { revalidatePath } from 'next/cache'

import { getAuthenticatedUser } from '@/lib/auth'
import { canModerateCommunity, readRelationshipIds } from '@/lib/community/subfeeds'

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

export async function createSubfeed(values: {
  name: string
  description: string
  rules?: string
  theme?: string
  avatarId?: number
}) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to create a subfeed')
  }

  const name = values.name.trim()
  const description = values.description.trim()
  const rules = values.rules?.trim()
  const theme = values.theme?.trim()
  const avatarId = values.avatarId

  if (name.length < 3) {
    throw new Error('Subfeed name must be at least 3 characters')
  }

  if (description.length < 12) {
    throw new Error('Description must be at least 12 characters')
  }

  if (avatarId !== undefined && (!Number.isInteger(avatarId) || avatarId <= 0)) {
    throw new Error('Invalid subfeed image')
  }

  const slug = slugify(name)
  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  const { docs: existing } = await payload.find({
    collection: 'subfeeds',
    where: {
      slug: {
        equals: slug,
      },
    },
    limit: 1,
    depth: 0,
    ...withAccess,
  })

  if (existing.length > 0) {
    throw new Error('A subfeed with this name already exists')
  }

  const subfeed = await payload.create({
    collection: 'subfeeds',
    data: {
      name,
      slug,
      description,
      avatar: avatarId,
      rules: rules || undefined,
      theme: theme || undefined,
      moderators: [user.id],
      members: [user.id],
    },
    ...withAccess,
  })

  revalidatePath('/subfeeds')
  revalidatePath(`/subfeeds/${subfeed.slug}`)

  return {
    id: subfeed.id,
    slug: subfeed.slug,
  }
}

export async function uploadSubfeedAvatar(formData: FormData) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to upload a subfeed image')
  }

  const file = formData.get('file')
  const subfeedName = String(formData.get('subfeedName') || '').trim()

  if (!file || !(file instanceof File)) {
    throw new Error('No file provided')
  }

  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/avif',
    'image/webp',
  ]
  if (!allowedMimeTypes.includes(file.type)) {
    throw new Error('Invalid file type. Only images are allowed.')
  }

  const maxSize = 5 * 1024 * 1024
  if (file.size > maxSize) {
    throw new Error('File size exceeds the 5MB limit.')
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  const alt = subfeedName.length > 0 ? `Avatar for ${subfeedName}` : 'Subfeed avatar'

  try {
    const media = await payload.create({
      collection: 'media',
      data: {
        alt,
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
    console.error('Error uploading subfeed image:', error)
    throw new Error('Failed to upload subfeed image')
  }
}

export async function toggleSubfeedMembership(subfeedId: number) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to join a subfeed')
  }

  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  const subfeed = await payload.findByID({
    collection: 'subfeeds',
    id: subfeedId,
    depth: 0,
    ...withAccess,
  })

  const currentMembers = readRelationshipIds(subfeed.members)
  const isMember = currentMembers.includes(user.id)
  const nextMembers = isMember
    ? currentMembers.filter((memberId) => memberId !== user.id)
    : Array.from(new Set([...currentMembers, user.id]))

  const updatedSubfeed = await payload.update({
    collection: 'subfeeds',
    id: subfeedId,
    data: {
      members: nextMembers,
    },
    ...withAccess,
  })

  revalidatePath('/subfeeds')
  revalidatePath(`/subfeeds/${updatedSubfeed.slug}`)

  return {
    joined: !isMember,
    memberCount: nextMembers.length,
  }
}

export async function updateSubfeed(values: {
  subfeedId: number
  name: string
  description: string
  rules?: string
  theme?: string
  avatarId?: number
}) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to edit a subfeed')
  }

  if (!Number.isInteger(values.subfeedId) || values.subfeedId <= 0) {
    throw new Error('Invalid subfeed')
  }

  const name = values.name.trim()
  const description = values.description.trim()
  const rules = values.rules?.trim()
  const theme = values.theme?.trim()
  const avatarId = values.avatarId

  if (name.length < 3) {
    throw new Error('Subfeed name must be at least 3 characters')
  }

  if (description.length < 12) {
    throw new Error('Description must be at least 12 characters')
  }

  if (avatarId !== undefined && (!Number.isInteger(avatarId) || avatarId <= 0)) {
    throw new Error('Invalid subfeed image')
  }

  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  const existingSubfeed = await payload.findByID({
    collection: 'subfeeds',
    id: values.subfeedId,
    depth: 0,
    ...withAccess,
  })

  const moderatorIds = readRelationshipIds(existingSubfeed.moderators)
  const canEditSubfeed = canModerateCommunity(user) || moderatorIds.includes(user.id)

  if (!canEditSubfeed) {
    throw new Error('You are not allowed to edit this subfeed')
  }

  const slug = slugify(name)

  const { docs: slugConflicts } = await payload.find({
    collection: 'subfeeds',
    where: {
      and: [
        {
          slug: {
            equals: slug,
          },
        },
        {
          id: {
            not_equals: values.subfeedId,
          },
        },
      ],
    },
    limit: 1,
    depth: 0,
    ...withAccess,
  })

  if (slugConflicts.length > 0) {
    throw new Error('A subfeed with this name already exists')
  }

  const updated = await payload.update({
    collection: 'subfeeds',
    id: values.subfeedId,
    data: {
      name,
      slug,
      description,
      rules: rules || undefined,
      theme: theme || undefined,
      ...(avatarId !== undefined ? { avatar: avatarId } : {}),
    },
    ...withAccess,
  })

  revalidatePath('/subfeeds')
  revalidatePath(`/subfeeds/${existingSubfeed.slug}`)

  if (updated.slug !== existingSubfeed.slug) {
    revalidatePath(`/subfeeds/${updated.slug}`)
  }

  return {
    id: updated.id,
    slug: updated.slug,
  }
}
