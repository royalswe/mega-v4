import type {
  Access,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  FieldAccess,
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

const canEditModeration: FieldAccess = ({ req: { user } }) => canModerateCommunity(user)

const readAccess: Access = ({ req: { user } }) => {
  if (!user) {
    return {
      and: [
        {
          _status: {
            equals: 'published',
          },
        },
        {
          moderationStatus: {
            not_equals: 'removed',
          },
        },
      ],
    } as any
  }

  if (canModerateCommunity(user)) {
    return true
  }

  return {
    and: [
      {
        moderationStatus: {
          not_equals: 'removed',
        },
      },
      {
        or: [
          {
            _status: {
              equals: 'published',
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
  } as any
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
        moderationStatus: {
          not_equals: 'removed',
        },
      },
    ],
  } as any
}

const prepareLink: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
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
      throw new Error('Links in subfeed feed must include a subfeed relation')
    }

    if (operation === 'create' && !canModerateCommunity(req.user)) {
      const authorId = resolveID(nextData?.user) ?? req.user?.id ?? null

      if (!authorId) {
        throw new Error('Links in subfeed feed must include a valid author')
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

  if (operation === 'create' && !nextData?.moderationStatus) {
    nextData.moderationStatus = canModerateCommunity(req.user) ? 'approved' : 'pending'
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
  const clickCount =
    typeof data?.clickCount === 'number'
      ? data.clickCount
      : typeof originalDoc?.clickCount === 'number'
        ? originalDoc.clickCount
        : 0

  const ranking = calculateRanking({
    createdAt: originalDoc?.createdAt || new Date().toISOString(),
    upvotes,
    downvotes,
    commentsCount,
    sharesCount,
    uniqueCommenters,
    trustedInteractions,
    discoveryMomentum: clickCount * 0.35,
  })

  const score = upvotes - downvotes

  return {
    ...data,
    votes: score,
    score,
    discoveryMomentum: Math.round(clickCount * 0.35 * 100) / 100,
    controversyScore: ranking.controversyScore,
    engagementVelocity: ranking.engagementVelocity,
    spamProbability: ranking.spamProbability,
    ragebaitProbability: ranking.ragebaitProbability,
    rankingScore: ranking.score,
    controversial: ranking.controversyScore >= 45 || ranking.ragebaitProbability >= 0.6,
  }
}

export const Links: CollectionConfig = {
  slug: 'links',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'user', 'moderationStatus', 'rankingScore', '_status'],
  },
  access: {
    read: readAccess,
    create: ({ req: { user } }) => Boolean(user),
    update: updateAccess,
    delete: updateAccess,
  },
  versions: {
    drafts: {
      autosave: true,
      schedulePublish: true, // Enable scheduled publishing
    },
  },
  hooks: {
    beforeValidate: [prepareLink],
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
      name: 'url',
      type: 'text',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'nsfw',
      type: 'checkbox',
    },
    {
      name: 'type',
      type: 'select',
      options: [
        {
          label: 'Article',
          value: 'article',
        },
        {
          label: 'Video',
          value: 'video',
        },
        {
          label: 'Image',
          value: 'image',
        },
        {
          label: 'Audio',
          value: 'audio',
        },
        {
          label: 'Game',
          value: 'game',
        },
      ],
      defaultValue: 'article',
      required: true,
    },
    {
      name: 'feed',
      type: 'select',
      defaultValue: 'main',
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
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'votes',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true }, // Admin can't manually cheat the votes
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
      name: 'moderationStatus',
      type: 'select',
      defaultValue: 'pending',
      index: true,
      options: [
        {
          label: 'Pending',
          value: 'pending',
        },
        {
          label: 'Approved',
          value: 'approved',
        },
        {
          label: 'Removed',
          value: 'removed',
        },
      ],
      access: {
        create: canEditModeration,
        update: canEditModeration,
      },
    },
    {
      name: 'clickCount',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    // VIRTUAL: This shows comments in the UI without storing an array of IDs
    {
      name: 'relatedComments',
      type: 'join',
      collection: 'comments',
      on: 'link',
      admin: {
        description: 'Comments related to this link',
        defaultColumns: ['comment', 'user'],
      },
    },
    // VIRTUAL: This shows who bookmarked it
    {
      name: 'saves',
      type: 'join',
      collection: 'bookmarks',
      on: 'link',
      admin: {
        description: 'Users who bookmarked this link',
        defaultColumns: ['user'],
      },
    },
  ],
}
