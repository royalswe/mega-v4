'use server'

import { revalidatePath } from 'next/cache'
import type { Payload } from 'payload'

import { getAuthenticatedUser } from '@/lib/auth'
import { assertSubfeedCreationEligible } from '@/lib/community/subfeedEligibility'
import {
  canModerateCommunity,
  canModerateSubfeedContent,
  readRelationshipIds,
  resolveSubfeedOwner,
} from '@/lib/community/subfeeds'
import type { User } from '@/payload-types'

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

  await assertSubfeedCreationEligible(payload, user.id)

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

  if (!slug) {
    throw new Error('Subfeed slug name is invalid.')
  }
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
      rules,
      theme,
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

export type SubfeedLocalRole = 'moderator' | 'editor' | 'uploader'

/**
 * Loads a SubFeed for roster management. Reads the acting user's own view
 * (`overrideAccess: false`) so the collection's `read` access still applies,
 * and enforces that only the owner, a local moderator, or a site
 * admin/moderator/editor may manage the roster.
 */
const loadManagedSubfeed = async (
  payload: Payload,
  subfeedId: number,
  user: User,
) => {
  const subfeed = await payload.findByID({
    collection: 'subfeeds',
    id: subfeedId,
    depth: 0,
    user,
    overrideAccess: false,
  })

  if (!canModerateCommunity(user) && !canModerateSubfeedContent(subfeed, user.id)) {
    throw new Error('You are not authorized to manage this subfeed')
  }

  return subfeed
}

type ManagedSubfeed = Awaited<ReturnType<typeof loadManagedSubfeed>>

const rosterIdsForRole = (subfeed: ManagedSubfeed, role: SubfeedLocalRole): number[] => {
  switch (role) {
    case 'moderator':
      return readRelationshipIds(subfeed.moderators)
    case 'editor':
      return readRelationshipIds(subfeed.editors)
    case 'uploader':
      return readRelationshipIds(subfeed.uploaders)
  }
}

/**
 * Appoints a user to a local role (moderator/editor/uploader) within a
 * SubFeed. Assigning a role also grants membership. Gated to the owner, a
 * local moderator, or a site admin/moderator/editor at the collection layer.
 */
export async function assignSubfeedRole(subfeedId: number, userId: number, role: SubfeedLocalRole) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to manage roles')
  }

  if (!Number.isInteger(subfeedId) || subfeedId <= 0) {
    throw new Error('Invalid subfeed')
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Invalid member')
  }

  const subfeed = await loadManagedSubfeed(payload, subfeedId, user)

  const currentIds = rosterIdsForRole(subfeed, role)
  const nextIds = Array.from(new Set([...currentIds, userId]))
  const nextMembers = Array.from(new Set([...readRelationshipIds(subfeed.members), userId]))

  const data = {
    members: nextMembers,
    ...(role === 'moderator' ? { moderators: nextIds } : {}),
    ...(role === 'editor' ? { editors: nextIds } : {}),
    ...(role === 'uploader' ? { uploaders: nextIds } : {}),
  }

  await payload.update({
    collection: 'subfeeds',
    id: subfeedId,
    data,
    user,
    context: { skipHooks: true },
    overrideAccess: false,
  })

  revalidatePath(`/subfeeds/${subfeed.slug}`)
}

/**
 * Revokes a local role (moderator/editor/uploader) from a user. The owner
 * cannot be demoted from the moderators list. Membership is preserved.
 */
export async function removeSubfeedRole(subfeedId: number, userId: number, role: SubfeedLocalRole) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to manage roles')
  }

  if (!Number.isInteger(subfeedId) || subfeedId <= 0) {
    throw new Error('Invalid subfeed')
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Invalid member')
  }

  const subfeed = await loadManagedSubfeed(payload, subfeedId, user)

  if (role === 'moderator' && resolveSubfeedOwner(subfeed) === userId) {
    throw new Error('You cannot remove the owner from moderators')
  }

  const currentIds = rosterIdsForRole(subfeed, role)
  const nextIds = currentIds.filter((id) => id !== userId)

  const data = {
    ...(role === 'moderator' ? { moderators: nextIds } : {}),
    ...(role === 'editor' ? { editors: nextIds } : {}),
    ...(role === 'uploader' ? { uploaders: nextIds } : {}),
  }

  await payload.update({
    collection: 'subfeeds',
    id: subfeedId,
    data,
    user,
    context: { skipHooks: true },
    overrideAccess: false,
  })

  revalidatePath(`/subfeeds/${subfeed.slug}`)
}

/**
 * Removes a user from the SubFeed entirely — members plus every local role.
 * The owner cannot be removed.
 */
export async function removeSubfeedMember(subfeedId: number, userId: number) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to manage members')
  }

  if (!Number.isInteger(subfeedId) || subfeedId <= 0) {
    throw new Error('Invalid subfeed')
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Invalid member')
  }

  const subfeed = await loadManagedSubfeed(payload, subfeedId, user)

  if (resolveSubfeedOwner(subfeed) === userId) {
    throw new Error('You cannot remove the owner from the subfeed')
  }

  const nextModerators = readRelationshipIds(subfeed.moderators).filter((id) => id !== userId)
  const nextEditors = readRelationshipIds(subfeed.editors).filter((id) => id !== userId)
  const nextUploaders = readRelationshipIds(subfeed.uploaders).filter((id) => id !== userId)
  const nextMembers = readRelationshipIds(subfeed.members).filter((id) => id !== userId)

  await payload.update({
    collection: 'subfeeds',
    id: subfeedId,
    data: {
      moderators: nextModerators,
      editors: nextEditors,
      uploaders: nextUploaders,
      members: nextMembers,
    },
    user,
    context: { skipHooks: true },
    overrideAccess: false,
  })

  revalidatePath(`/subfeeds/${subfeed.slug}`)
}
