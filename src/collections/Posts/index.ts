import type {
  Access,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  FieldAccess,
  Where,
} from 'payload'

import { calculateRanking } from '@/lib/community/ranking'
import { canModerateCommunity, isSubfeedMemberOrModerator } from '@/lib/community/subfeeds'
import { resolveID } from '@/lib/community/userSignals'

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

const canEditStatus: FieldAccess = ({ req: { user } }) => canModerateCommunity(user)

const readAccess: Access = ({ req: { user } }) => {
  if (!user) {
    return {
      status: {
        equals: 'published',
      },
    } as Where
  }

  if (canModerateCommunity(user)) {
    return true
  }

  return {
    or: [
      {
        status: {
          equals: 'published',
        },
      },
      {
        and: [
          {
            status: {
              equals: 'pending',
            },
          },
          {
            user: {
              equals: user.id,
            },
          },
        ],
      },
    ],
  } as Where
}

const updateAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (canModerateCommunity(user)) return true

  return {
    and: [
      {
        user: {
          equals: user.id,
        },
      },
      {
        status: {
          not_equals: 'removed',
        },
      },
    ],
  } as Where
}

const preparePost: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  const nextData = { ...data }

  if (typeof nextData?.title === 'string' && nextData.title.length > 0) {
    nextData.slug = nextData.slug || slugify(nextData.title)
  }

  if (nextData?.subfeed && nextData.feed !== 'subfeed') {
    nextData.feed = 'subfeed'
  }

  if (nextData?.feed === 'subfeed') {
    const subfeedId = resolveID(nextData?.subfeed)
    if (!subfeedId) {
      throw new Error('Posts in subfeed feed must include a subfeed relation')
    }

    if (operation === 'create' && !canModerateCommunity(req.user)) {
      const authorId = resolveID(nextData?.user) ?? req.user?.id ?? null

      if (!authorId) {
        throw new Error('Posts in subfeed feed must include a valid author')
      }

      const subfeed = await req.payload.findByID({
        collection: 'subfeeds',
        id: subfeedId,
        depth: 0,
        overrideAccess: true,
        req,
      })

      if (!isSubfeedMemberOrModerator(subfeed, authorId)) {
        throw new Error('You must join this subfeed before posting')
      }
    }
  }

  if (operation === 'create' && !nextData?.status) {
    const isSubfeedPost = nextData?.feed === 'subfeed'
    nextData.status = isSubfeedPost || canModerateCommunity(req.user) ? 'published' : 'pending'
  }

  return nextData
}

const syncDerivedSignals: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const upvotes =
    typeof data?.upvotes === 'number'
      ? data.upvotes
      : typeof originalDoc?.upvotes === 'number'
        ? originalDoc.upvotes
        : 0
  const downvotes =
    typeof data?.downvotes === 'number'
      ? data.downvotes
      : typeof originalDoc?.downvotes === 'number'
        ? originalDoc.downvotes
        : 0
  const commentsCount =
    typeof data?.commentsCount === 'number'
      ? data.commentsCount
      : typeof originalDoc?.commentsCount === 'number'
        ? originalDoc.commentsCount
        : 0
  const sharesCount =
    typeof data?.sharesCount === 'number'
      ? data.sharesCount
      : typeof originalDoc?.sharesCount === 'number'
        ? originalDoc.sharesCount
        : 0
  const uniqueCommenters =
    typeof data?.uniqueCommenters === 'number'
      ? data.uniqueCommenters
      : typeof originalDoc?.uniqueCommenters === 'number'
        ? originalDoc.uniqueCommenters
        : 0
  const trustedInteractions =
    typeof data?.trustedInteractions === 'number'
      ? data.trustedInteractions
      : typeof originalDoc?.trustedInteractions === 'number'
        ? originalDoc.trustedInteractions
        : 0
  const discoveryMomentum =
    typeof data?.discoveryMomentum === 'number'
      ? data.discoveryMomentum
      : typeof originalDoc?.discoveryMomentum === 'number'
        ? originalDoc.discoveryMomentum
        : 0

  const ranking = calculateRanking({
    createdAt: originalDoc?.createdAt || new Date().toISOString(),
    upvotes,
    downvotes,
    commentsCount,
    sharesCount,
    uniqueCommenters,
    trustedInteractions,
    discoveryMomentum,
  })

  const score = upvotes - downvotes

  return {
    ...data,
    votes: score,
    score,
    controversyScore: ranking.controversyScore,
    engagementVelocity: ranking.engagementVelocity,
    spamProbability: ranking.spamProbability,
    ragebaitProbability: ranking.ragebaitProbability,
    rankingScore: ranking.score,
    controversial: ranking.controversyScore >= 45 || ranking.ragebaitProbability >= 0.6,
  }
}

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'user', 'status', 'rankingScore'],
    group: 'Social',
  },
  access: {
    read: readAccess,
    create: ({ req: { user } }) => Boolean(user),
    update: updateAccess,
    delete: ({ req: { user } }) => canModerateCommunity(user),
  },
  hooks: {
    beforeValidate: [preparePost],
    beforeChange: [syncDerivedSignals],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      defaultValue: 'discussion',
      options: [
        {
          label: 'Link',
          value: 'link',
        },
        {
          label: 'Article',
          value: 'article',
        },
        {
          label: 'Image',
          value: 'image',
        },
        {
          label: 'Video',
          value: 'video',
        },
        {
          label: 'Discussion',
          value: 'discussion',
        },
      ],
      required: true,
    },
    {
      name: 'nsfw',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'feed',
      type: 'select',
      defaultValue: 'user',
      options: [
        {
          label: 'Main Feed',
          value: 'main',
        },
        {
          label: 'User Feed',
          value: 'user',
        },
        {
          label: 'Sub Feed',
          value: 'subfeed',
        },
      ],
      required: true,
    },
    {
      name: 'subfeed',
      type: 'relationship',
      relationTo: 'subfeeds',
      index: true,
      admin: {
        condition: (_, siblingData) => siblingData.feed === 'subfeed',
      },
    },
    {
      name: 'tags',
      type: 'text',
      hasMany: true,
    },
    {
      name: 'votes',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'score',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'rankingScore',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
      index: true,
    },
    {
      name: 'controversyScore',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'discoveryMomentum',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'engagementVelocity',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'upvotes',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'downvotes',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'commentsCount',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'sharesCount',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'uniqueCommenters',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'trustedInteractions',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'spamProbability',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
      access: {
        read: ({ req: { user } }) => canModerateCommunity(user),
      },
    },
    {
      name: 'ragebaitProbability',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
      access: {
        read: ({ req: { user } }) => canModerateCommunity(user),
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'breaking',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'controversial',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      index: true,
      options: [
        {
          label: 'Published',
          value: 'published',
        },
        {
          label: 'Pending',
          value: 'pending',
        },
        {
          label: 'Removed',
          value: 'removed',
        },
      ],
      access: {
        create: canEditStatus,
        update: canEditStatus,
      },
    },
    // VIRTUAL: This shows comments in the UI without storing an array of IDs
    {
      name: 'relatedComments',
      type: 'join',
      collection: 'comments',
      on: 'post',
      admin: {
        description: 'Comments related to this post',
        defaultColumns: ['comment', 'user'],
      },
    },
    // VIRTUAL: This shows who bookmarked it
    {
      name: 'saves',
      type: 'join',
      collection: 'bookmarks',
      on: 'post',
      admin: {
        description: 'Users who bookmarked this post',
        defaultColumns: ['user'],
      },
    },
  ],
}
