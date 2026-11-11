import type {
  Access,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  FieldAccess,
  Where,
} from 'payload'

import { calculateRanking, EDITORIAL_PRIORITY_DURATION_MS } from '@/lib/community/ranking'
import { getNumericFieldValue } from '@/lib/community/signalFields'
import {
  canCurateSubfeedContent,
  canManageSubmittedLinks,
  canModerateCommunity,
  canModerateSubfeedContent,
  canSubmitToSubfeed,
  enforceSubfeedContentTargetAccess,
} from '@/lib/community/subfeeds'
import type { SubfeedRosterLike } from '@/lib/community/subfeeds'
import { createDiscoveryBoostEnforcementHook } from '@/lib/community/discoveryBoostHook'
import { resolveID } from '@/lib/community/userSignals'

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

const canEditStatus: FieldAccess = ({ req: { user } }) => canModerateCommunity(user)

const canEditModeration: FieldAccess = ({ req: { user } }) => canModerateCommunity(user)

/** Loads the SubFeed a Post targets (if any) for local-role authorization checks. */
const getPostSubfeed = async (
  req: Parameters<Access>[0]['req'],
  id?: number | string,
): Promise<SubfeedRosterLike | null> => {
  if (!id) return null

  const post = await req.payload.findByID({
    collection: 'posts',
    id,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const subfeedId = post ? resolveID(post.subfeed) : null
  if (!subfeedId) return null

  const subfeed = await req.payload.findByID({
    collection: 'subfeeds',
    id: subfeedId,
    depth: 0,
    overrideAccess: true,
    req,
  })

  return subfeed ?? null
}

const readAccess: Access = ({ req: { user } }) => {
  if (!user) {
    return {
      and: [
        {
          status: {
            equals: 'published',
          },
        },
        {
          quarantined: {
            not_equals: true,
          },
        },
      ],
    } as Where
  }

  if (canModerateCommunity(user)) {
    return true
  }

  return {
    and: [
      {
        quarantined: {
          not_equals: true,
        },
      },
      {
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
      },
    ],
  } as Where
}

const updateAccess: Access = async ({ req, id }) => {
  const { user } = req
  if (!user) return false
  if (canModerateCommunity(user)) return true

  const subfeed = await getPostSubfeed(req, id)
  if (subfeed && canCurateSubfeedContent(subfeed, user.id)) return true

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

const deleteAccess: Access = async ({ req, id }) => {
  const { user } = req
  if (!user) return false
  if (canModerateCommunity(user)) return true

  const subfeed = await getPostSubfeed(req, id)
  if (subfeed && canModerateSubfeedContent(subfeed, user.id)) return true

  // Posts were previously deletable only by site moderators; preserve that.
  return false
}

const preparePost: CollectionBeforeValidateHook = async ({ data, operation, req, originalDoc }) => {
  if (req?.context?.skipHooks) return data
  const nextData = { ...data }

  if (typeof nextData?.title === 'string' && nextData.title.length > 0) {
    nextData.slug = nextData.slug || slugify(nextData.title)
  }

  if (nextData?.subfeed && (nextData.feed ?? originalDoc?.feed) !== 'subfeed') {
    nextData.feed = 'subfeed'
  }

  const effectiveFeed = nextData.feed !== undefined ? nextData.feed : originalDoc?.feed
  const effectiveSubfeed = nextData.subfeed !== undefined ? nextData.subfeed : originalDoc?.subfeed

  if (effectiveFeed === 'subfeed') {
    const subfeedId = resolveID(effectiveSubfeed)
    if (!subfeedId) {
      if (operation === 'create') {
        throw new Error('Posts in subfeed feed must include a subfeed relation')
      }
      // If the referenced subfeed was cascade-deleted (ON DELETE SET NULL),
      // demote this post to user feed rather than bricking updates
      nextData.feed = 'user'
    } else if (!canModerateCommunity(req.user)) {
      const authorId =
        resolveID(nextData.user !== undefined ? nextData.user : originalDoc?.user) ??
        req.user?.id ??
        null

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

      if (!canSubmitToSubfeed(subfeed, authorId)) {
        throw new Error('You must join this subfeed before posting')
      }
    }
  }

  const authorId = resolveID(nextData?.user) ?? resolveID(originalDoc?.user) ?? req.user?.id ?? null
  let hasEditorialRole = false

  if (req.user && req.user.id === authorId) {
    hasEditorialRole = canManageSubmittedLinks(req.user)
  } else if (authorId) {
    const author = await req.payload.findByID({
      collection: 'users',
      id: authorId,
      depth: 0,
      overrideAccess: true,
      req,
    })
    hasEditorialRole = Boolean(author && canManageSubmittedLinks(author))
  }

  if (operation === 'create') {
    const isSubfeedPost = nextData?.feed === 'subfeed'

    if (hasEditorialRole) {
      // Editorial publishers (admin/moderator/editor/uploader) publish
      // directly. `status` carries its `pending` defaultValue by the time
      // hooks run, so an explicit `removed` is the only choice we keep.
      if (nextData?.status !== 'removed') {
        nextData.status = 'published'
      }
    } else {
      nextData.status = isSubfeedPost ? 'published' : 'pending'
    }
  }

  return nextData
}

/**
 * Grants a time-bounded editorial priority window to direct Main Feed
 * publications by recognized editorial publishers (ticket #19).
 *
 * This MUST be a `beforeChange` hook (running after field validation), not a
 * `beforeValidate` hook: the `editorialPriority` fields have moderator-only
 * field-level access, so values written during `beforeValidate` are stripped
 * during validation for non-moderator actors. Values written by `beforeChange`
 * hooks are persisted — the same sanctioned pattern the discovery-boost hook
 * uses for its server-derived fields.
 */
const grantEditorialPriority: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (req?.context?.skipHooks) return data
  if (!data) return data

  const feed = data.feed ?? originalDoc?.feed
  if (feed !== 'main') return data
  if (operation !== 'create' && originalDoc?.feed === 'main') return data

  const authorId = resolveID(data.user) ?? resolveID(originalDoc?.user) ?? req.user?.id ?? null
  let hasEditorialRole = false

  if (req.user && req.user.id === authorId) {
    hasEditorialRole = canManageSubmittedLinks(req.user)
  } else if (authorId) {
    const author = await req.payload.findByID({
      collection: 'users',
      id: authorId,
      depth: 0,
      overrideAccess: true,
      req,
    })
    hasEditorialRole = Boolean(author && canManageSubmittedLinks(author))
  }

  if (!hasEditorialRole) return data

  return {
    ...data,
    editorialPriority: true,
    editorialPriorityUntil: new Date(
      Date.now() + EDITORIAL_PRIORITY_DURATION_MS,
    ).toISOString(),
  }
}

const syncDerivedSignals: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const upvotes = getNumericFieldValue(data, originalDoc, 'upvotes')
  const downvotes = getNumericFieldValue(data, originalDoc, 'downvotes')
  const commentsCount = getNumericFieldValue(data, originalDoc, 'commentsCount')
  const sharesCount = getNumericFieldValue(data, originalDoc, 'sharesCount')
  const uniqueCommenters = getNumericFieldValue(data, originalDoc, 'uniqueCommenters')
  const trustedInteractions = getNumericFieldValue(data, originalDoc, 'trustedInteractions')
  const discoveryMomentum = getNumericFieldValue(data, originalDoc, 'discoveryMomentum')

  const editorialPriority =
    data.editorialPriority !== undefined
      ? Boolean(data.editorialPriority)
      : Boolean(originalDoc?.editorialPriority)
  const editorialPriorityUntil =
    data.editorialPriorityUntil !== undefined
      ? data.editorialPriorityUntil
      : originalDoc?.editorialPriorityUntil

  const ranking = calculateRanking({
    createdAt: originalDoc?.createdAt || new Date().toISOString(),
    upvotes,
    downvotes,
    commentsCount,
    sharesCount,
    uniqueCommenters,
    trustedInteractions,
    discoveryMomentum,
    editorialPriority,
    editorialPriorityUntil,
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
    delete: deleteAccess,
  },
  hooks: {
    beforeValidate: [enforceSubfeedContentTargetAccess, preparePost],
    beforeChange: [createDiscoveryBoostEnforcementHook(), grantEditorialPriority, syncDerivedSignals],
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
      name: 'quarantined',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        description:
          'Quarantined content is excluded from Main Feed promotion regardless of score or origin.',
      },
      access: {
        create: canEditModeration,
        update: canEditModeration,
      },
    },
    {
      name: 'discoveryBoosted',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Curated discovery boost into Main Feed visibility (set via the boost action).',
      },
      access: {
        create: canEditModeration,
        update: canEditModeration,
      },
    },
    {
      name: 'boostedAt',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'When this content was last discovery-boosted.',
      },
      access: {
        create: canEditModeration,
        update: canEditModeration,
      },
    },
    {
      name: 'boostedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
        description: 'The member with Discovery standing who boosted this content.',
      },
      access: {
        create: canEditModeration,
        update: canEditModeration,
      },
    },
    {
      name: 'editorialPriority',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        description: 'Time-bounded priority boost for direct Main Feed editorial publication.',
      },
      access: {
        create: canEditModeration,
        update: canEditModeration,
      },
    },
    {
      name: 'editorialPriorityUntil',
      type: 'date',
      index: true,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: 'Expiration timestamp for the editorial priority boost.',
      },
      access: {
        create: canEditModeration,
        update: canEditModeration,
      },
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
  versions: false,
  authorship: false,
}
