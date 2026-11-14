'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { getAuthenticatedUser } from '@/lib/auth'
import { checkRole } from '@/access/checkRole'
import { castContentVote, toggleContentBookmark } from '@/lib/community/interactions'
import {
  MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE,
  SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE,
  canManageSubmittedLinks,
  canModerateCommunity,
  canSubmitToSubfeed,
  derivePersistedPublicationState,
} from '@/lib/community/subfeeds'
import type { SubmissionOutcome } from '@/lib/community/subfeeds'

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

export async function setContributeCardCollapsedPreference(collapsed: boolean) {
  const cookieStore = await cookies()
  cookieStore.set('contributeCardCollapsed', collapsed ? 'true' : 'false', {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
}

export async function vote(linkId: number, type: 'up' | 'down') {
  const { user, payload } = await getAuthenticatedUser()

  await castContentVote({
    payload,
    user,
    targetCollection: 'links',
    targetId: linkId,
    type,
  })

  revalidatePath(`/link/${linkId}`)
}

export async function toggleBookmark(linkId: number) {
  const { user, payload } = await getAuthenticatedUser()

  await toggleContentBookmark({
    payload,
    user,
    targetCollection: 'links',
    targetId: linkId,
  })

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
  feed?: 'user' | 'subfeed' | 'main'
  subfeedId?: number
}): Promise<SubmissionOutcome> {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to submit a link')
  }

  const userId = user.id
  const withAccess = {
    user,
    overrideAccess: false as const,
  }
  const feed = values.feed ?? 'user'

  if (feed === 'main' && !canManageSubmittedLinks(user)) {
    throw new Error(MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE)
  }

  let subfeed: { id: number; name: string; slug: string } | null = null

  if (feed === 'subfeed') {
    if (
      typeof values.subfeedId !== 'number' ||
      !Number.isInteger(values.subfeedId) ||
      values.subfeedId <= 0
    ) {
      throw new Error('Please select a subfeed destination')
    }

    const selectedSubfeed = await payload.findByID({
      collection: 'subfeeds',
      id: values.subfeedId,
      depth: 0,
      ...withAccess,
    })

    if (!canModerateCommunity(user) && !canSubmitToSubfeed(selectedSubfeed, userId)) {
      throw new Error(SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE)
    }

    subfeed = {
      id: selectedSubfeed.id,
      name: selectedSubfeed.name,
      slug: selectedSubfeed.slug,
    }
  }

  const createdLink = await payload.create({
    collection: 'links',
    data: {
      title: values.title,
      url: values.url,
      description: values.description,
      nsfw: values.nsfw,
      type: values.type ?? 'article',
      user: userId,
      feed,
      subfeed: subfeed?.id,
      _status: 'published',
      featured: false,
    },
    draft: false,
    ...withAccess,
  })

  revalidatePath('/')
  revalidatePath('/submitted')
  revalidatePath('/subfeeds')
  revalidatePath(`/user/${encodeURIComponent(user.username)}`)

  if (subfeed) {
    revalidatePath(`/subfeeds/${subfeed.slug}`)
  }

  const visibility = derivePersistedPublicationState('link', createdLink)
  const persistedFeed = (createdLink.feed ?? feed) as SubmissionOutcome['feed']

  return {
    kind: 'link',
    id: createdLink.id,
    title: createdLink.title,
    feed: persistedFeed,
    visibility,
    isPublic: visibility === 'published',
    itemHref: visibility === 'blocked' ? null : `/link/${createdLink.id}`,
    destinationHref:
      persistedFeed === 'subfeed' && subfeed
        ? `/subfeeds/${subfeed.slug}`
        : persistedFeed === 'main'
          ? '/'
          : `/user/${encodeURIComponent(user.username)}?tab=links`,
    destinationLabel:
      persistedFeed === 'subfeed' && subfeed
        ? subfeed.name
        : persistedFeed === 'main'
          ? 'Main Feed'
          : 'Your User Feed',
    subfeed: subfeed ?? undefined,
    authorUsername: user.username,
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
  feed: 'user' | 'main' | 'subfeed'
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
      subfeed: values.feed === 'subfeed' ? nextSubfeedId : null,
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
