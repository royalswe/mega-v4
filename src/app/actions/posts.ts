'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedUser } from '@/lib/auth'
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

export async function vote(postId: number, type: 'up' | 'down') {
  const { user, payload } = await getAuthenticatedUser()

  await castContentVote({
    payload,
    user,
    targetCollection: 'posts',
    targetId: postId,
    type,
  })

  revalidatePath('/wall')
  revalidatePath(`/post/${postId}`)
}

export async function toggleBookmark(postId: number) {
  const { user, payload } = await getAuthenticatedUser()

  await toggleContentBookmark({
    payload,
    user,
    targetCollection: 'posts',
    targetId: postId,
  })

  revalidatePath('/wall')
  revalidatePath(`/post/${postId}`)
}

export async function submitPost(values: {
  title: string
  content: string
  nsfw?: boolean
  feed?: 'user' | 'subfeed' | 'main'
  subfeedId?: number
}): Promise<SubmissionOutcome> {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to submit a post')
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

  // `status` is moderator-only field access, so publication state is derived
  // by `preparePost` from the effective destination, not passed by the member.
  const createdPost = await payload.create({
    collection: 'posts',
    data: {
      title: values.title,
      content: JSON.parse(values.content),
      nsfw: values.nsfw,
      user: userId,
      feed,
      subfeed: subfeed?.id,
      type: 'discussion',
    },
    ...withAccess,
  })

  revalidatePath('/wall')
  revalidatePath('/subfeeds')
  revalidatePath(`/user/${encodeURIComponent(user.username)}`)

  if (subfeed) {
    revalidatePath(`/subfeeds/${subfeed.slug}`)
  }

  const visibility = derivePersistedPublicationState('post', createdPost)
  const persistedFeed = (createdPost.feed ?? feed) as SubmissionOutcome['feed']

  return {
    kind: 'post',
    id: createdPost.id,
    title: createdPost.title,
    feed: persistedFeed,
    visibility,
    isPublic: visibility === 'published',
    itemHref: visibility === 'blocked' ? null : `/post/${createdPost.id}`,
    destinationHref:
      persistedFeed === 'subfeed' && subfeed
        ? `/subfeeds/${subfeed.slug}`
        : persistedFeed === 'main'
          ? '/'
          : `/user/${encodeURIComponent(user.username)}?tab=posts`,
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
