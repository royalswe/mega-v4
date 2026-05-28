'use server'

import { revalidatePath } from 'next/cache'

import { getAuthenticatedUser } from '@/lib/auth'
import { readRelationshipIds } from '@/lib/community/subfeeds'

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
}) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to create a subfeed')
  }

  const name = values.name.trim()
  const description = values.description.trim()
  const rules = values.rules?.trim()
  const theme = values.theme?.trim()

  if (name.length < 3) {
    throw new Error('Subfeed name must be at least 3 characters')
  }

  if (description.length < 12) {
    throw new Error('Description must be at least 12 characters')
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
