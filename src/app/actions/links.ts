'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { getAuthenticatedUser } from '@/lib/auth'
import { checkRole } from '@/access/checkRole'
import {
  canManageSubmittedLinks,
  canModerateCommunity,
  isSubfeedMemberOrModerator,
} from '@/lib/community/subfeeds'

export async function setMainFeedMixPreference(includeSubfeeds: boolean) {
  const { user } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to update feed preferences')
  }

  const cookieStore = await cookies()
  cookieStore.set('mixSubfeeds', includeSubfeeds ? 'true' : 'false', {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidatePath('/')
}

export async function setHomeSubfeedsViewPreference(view: 'trending' | 'joined') {
  const cookieStore = await cookies()
  cookieStore.set('homeSubfeedsView', view, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidatePath('/')
}

export async function vote(linkId: number, type: 'up' | 'down') {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to vote')
  }

  const userId = user.id
  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  // Find existing vote
  const { docs: existingVotes } = await payload.find({
    collection: 'votes',
    where: {
      user: { equals: userId },
      link: { equals: linkId },
    },
    ...withAccess,
  })

  if (existingVotes.length > 0) {
    if (existingVotes[0].vote === type) {
      await payload.delete({ collection: 'votes', id: existingVotes[0].id, ...withAccess })
    } else {
      await payload.update({
        collection: 'votes',
        id: existingVotes[0].id,
        data: { vote: type },
        ...withAccess,
      })
    }
  } else {
    await payload.create({
      collection: 'votes',
      data: { user: userId, link: linkId, vote: type },
      ...withAccess,
    })
  }

  revalidatePath('/')
  revalidatePath('/submitted')
  revalidatePath(`/link/${linkId}`)
}

export async function toggleBookmark(linkId: number) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to bookmark')
  }

  const userId = user.id
  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  const { docs: existingBookmarks } = await payload.find({
    collection: 'bookmarks',
    where: {
      user: {
        equals: userId,
      },
      link: {
        equals: linkId,
      },
    },
    ...withAccess,
  })

  if (existingBookmarks.length > 0) {
    // Bookmark exists, so delete it
    await payload.delete({
      collection: 'bookmarks',
      id: existingBookmarks[0].id,
      ...withAccess,
    })
  } else {
    // Bookmark does not exist, so create it
    await payload.create({
      collection: 'bookmarks',
      data: {
        user: userId,
        link: linkId,
      },
      ...withAccess,
    })
  }

  revalidatePath('/')
  revalidatePath('/submitted')
  revalidatePath(`/link/${linkId}`)
}

export async function submitLink(values: {
  title: string
  url: string
  description?: string
  nsfw?: boolean
  type?: 'article' | 'video' | 'image' | 'audio' | 'game'
  feed: 'main' | 'subfeed'
  subfeedId?: number
}) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to submit a link')
  }

  const userId = user.id
  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  let subfeedId: number | undefined
  let subfeedSlug: string | null = null
  const isSubfeedSubmission = values.feed === 'subfeed'

  if (values.feed === 'subfeed') {
    if (
      typeof values.subfeedId !== 'number' ||
      !Number.isInteger(values.subfeedId) ||
      values.subfeedId <= 0
    ) {
      throw new Error('Please select a subfeed destination')
    }

    const subfeed = await payload.findByID({
      collection: 'subfeeds',
      id: values.subfeedId,
      depth: 0,
      ...withAccess,
    })

    if (!canModerateCommunity(user) && !isSubfeedMemberOrModerator(subfeed, userId)) {
      throw new Error('You must join this subfeed before posting')
    }

    subfeedId = subfeed.id
    subfeedSlug = subfeed.slug
  }

  const linkData = {
    title: values.title,
    url: values.url,
    description: values.description,
    nsfw: values.nsfw,
    type: values.type,
    user: userId,
    feed: values.feed,
    subfeed: subfeedId,
  }

  if (isSubfeedSubmission) {
    const createdLink = await payload.create({
      collection: 'links',
      data: linkData,
      draft: true,
      ...withAccess,
    })

    await payload.update({
      collection: 'links',
      id: createdLink.id,
      data: {
        _status: 'published',
        featured: false,
      },
      draft: false,
      ...withAccess,
    })
  } else {
    await payload.create({
      collection: 'links',
      data: linkData,
      draft: true,
      ...withAccess,
    })
  }

  revalidatePath('/')
  revalidatePath('/submitted')
  revalidatePath('/subfeeds')

  if (subfeedSlug) {
    revalidatePath(`/subfeeds/${subfeedSlug}`)
  }
}

export async function enableSubmittedLinkInMainFeed(linkId: number) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user || !canManageSubmittedLinks(user)) {
    throw new Error('You are not authorized to enable links in main feed')
  }

  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  const link = await payload.findByID({
    collection: 'links',
    id: linkId,
    depth: 1,
    draft: true,
    ...withAccess,
  })

  if (!link || link.softDeleted) {
    throw new Error('Link not found')
  }

  if (link.feed !== 'subfeed') {
    throw new Error('Only subfeed links can be enabled in main feed')
  }

  await payload.update({
    collection: 'links',
    id: linkId,
    data: {
      featured: true,
      _status: 'published',
    },
    draft: false,
    ...withAccess,
  })

  revalidatePath('/')
  revalidatePath('/submitted')
  revalidatePath('/subfeeds')

  if (link.subfeed && typeof link.subfeed === 'object' && link.subfeed.slug) {
    revalidatePath(`/subfeeds/${link.subfeed.slug}`)
  }
}

export async function toggleSubmittedLinkStatus(linkId: number, nextStatus: 'draft' | 'published') {
  const { user, payload } = await getAuthenticatedUser()

  if (!user || !canManageSubmittedLinks(user)) {
    throw new Error('You are not authorized to change link status')
  }

  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  if (nextStatus === 'draft') {
    await payload.update({
      collection: 'links',
      id: linkId,
      data: {
        _status: 'draft',
      },
      draft: false,
      publishAllLocales: false,
      unpublishAllLocales: true,
      ...withAccess,
    })
  } else {
    await payload.update({
      collection: 'links',
      id: linkId,
      data: {
        _status: 'published',
      },
      draft: false,
      ...withAccess,
    })
  }

  revalidatePath('/')
  revalidatePath('/submitted')
  revalidatePath(`/link/${linkId}`)
}

export async function deleteSubmittedLink(linkId: number) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user || !canManageSubmittedLinks(user)) {
    throw new Error('You are not authorized to soft delete links')
  }

  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  await payload.update({
    collection: 'links',
    id: linkId,
    data: {
      softDeleted: true,
    },
    ...withAccess,
  })

  revalidatePath('/')
  revalidatePath('/submitted')
  revalidatePath('/subfeeds')
  revalidatePath(`/link/${linkId}`)
}

export async function updateLinkAsAdmin(values: {
  linkId: number
  title: string
  url: string
  description?: string
  nsfw?: boolean
  type?: 'article' | 'video' | 'image' | 'audio' | 'game'
  feed: 'main' | 'subfeed'
  subfeedId?: number
}) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user || !checkRole(['admin'], user)) {
    throw new Error('You are not authorized to edit links')
  }

  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  const existingLink = await payload.findByID({
    collection: 'links',
    id: values.linkId,
    depth: 1,
    draft: true,
    ...withAccess,
  })

  if (!existingLink || existingLink.softDeleted) {
    throw new Error('Link not found')
  }

  let nextSubfeedId: number | undefined
  let nextSubfeedSlug: string | null = null

  if (values.feed === 'subfeed') {
    if (
      typeof values.subfeedId !== 'number' ||
      !Number.isInteger(values.subfeedId) ||
      values.subfeedId <= 0
    ) {
      throw new Error('Please select a subfeed destination')
    }

    const subfeed = await payload.findByID({
      collection: 'subfeeds',
      id: values.subfeedId,
      depth: 0,
      ...withAccess,
    })

    nextSubfeedId = subfeed.id
    nextSubfeedSlug = subfeed.slug
  }

  const previousSubfeedSlug =
    existingLink.subfeed && typeof existingLink.subfeed === 'object'
      ? existingLink.subfeed.slug || null
      : null

  await payload.update({
    collection: 'links',
    id: values.linkId,
    data: {
      title: values.title,
      url: values.url,
      description: values.description,
      nsfw: values.nsfw,
      type: values.type,
      feed: values.feed,
      subfeed: nextSubfeedId,
    },
    ...withAccess,
  })

  revalidatePath('/')
  revalidatePath('/submitted')
  revalidatePath('/subfeeds')
  revalidatePath(`/link/${values.linkId}`)

  if (previousSubfeedSlug) {
    revalidatePath(`/subfeeds/${previousSubfeedSlug}`)
  }

  if (nextSubfeedSlug && nextSubfeedSlug !== previousSubfeedSlug) {
    revalidatePath(`/subfeeds/${nextSubfeedSlug}`)
  }
}
