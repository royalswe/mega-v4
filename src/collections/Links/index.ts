import type {
  Access,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
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
  enforceContentPublishingPolicy,
  enforceSubfeedContentTargetAccess,
  normalizeContentDestination,
  recordDraftIntent,
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

const MAX_SLUG_ATTEMPTS = 50

async function ensureUniqueLinkSlug({
  req,
  baseSlug,
  currentId,
}: {
  req: Parameters<CollectionBeforeValidateHook>[0]['req']
  baseSlug: string
  currentId?: number | string
}) {
  const normalizedBase = baseSlug.trim() || 'link'

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidateSlug = attempt === 0 ? normalizedBase : `${normalizedBase}-${attempt + 1}`

    const where: Where = currentId
      ? {
          and: [
            {
              slug: {
                equals: candidateSlug,
              },
            },
            {
              id: {
                not_equals: currentId,
              },
            },
          ],
        }
      : {
          slug: {
            equals: candidateSlug,
          },
        }

    const existing = await req.payload.find({
      collection: 'links',
      where,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
    })

    if (existing.totalDocs === 0) {
      return candidateSlug
    }
  }

  throw new Error('Could not generate a unique slug for this link')
}

const canEditModeration: FieldAccess = ({ req: { user } }) => canModerateCommunity(user)

/** Loads the SubFeed a Link targets (if any) for local-role authorization checks. */
const getLinkSubfeed = async (
  req: Parameters<Access>[0]['req'],
  id?: number | string,
): Promise<SubfeedRosterLike | null> => {
  if (!id) return null

  const link = await req.payload.findByID({
    collection: 'links',
    id,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const subfeedId = link ? resolveID(link.subfeed) : null
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
          _status: {
            equals: 'published',
          },
        },
        {
          softDeleted: {
            not_equals: true,
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
        softDeleted: {
          not_equals: true,
        },
      },
      {
        quarantined: {
          not_equals: true,
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
  } as Where
}

const updateAccess: Access = async ({ req, id }) => {
  const { user } = req
  if (!user) return false
  if (canModerateCommunity(user)) return true

  const subfeed = await getLinkSubfeed(req, id)
  if (subfeed && canCurateSubfeedContent(subfeed, user.id)) return true

  return {
    and: [
      {
        user: {
          equals: user.id,
        },
      },
      {
        softDeleted: {
          not_equals: true,
        },
      },
    ],
  } as Where
}

const deleteAccess: Access = async ({ req, id }) => {
  const { user } = req
  if (!user) return false
  if (canModerateCommunity(user)) return true

  const subfeed = await getLinkSubfeed(req, id)
  if (subfeed && canModerateSubfeedContent(subfeed, user.id)) return true

  return {
    and: [
      {
        user: {
          equals: user.id,
        },
      },
      {
        softDeleted: {
          not_equals: true,
        },
      },
    ],
  } as Where
}

const prepareLink: CollectionBeforeValidateHook = async ({ data, operation, req, originalDoc }) => {
  if (req?.context?.skipHooks) return data

  const nextData = await enforceContentPublishingPolicy({
    data: normalizeContentDestination({ data, operation, originalDoc }),
    operation,
    originalDoc,
    req,
    messages: {
      missingRelation: 'Links in subfeed feed must include a subfeed relation',
      missingAuthor: 'Links in subfeed feed must include a valid author',
    },
  })

  if (typeof nextData?.title === 'string' && nextData.title.length > 0) {
    const preferredSlugSource =
      typeof nextData.slug === 'string' && nextData.slug.trim().length > 0
        ? nextData.slug
        : nextData.title

    const preferredSlug = slugify(preferredSlugSource) || 'link'
    nextData.slug = await ensureUniqueLinkSlug({
      req,
      baseSlug: preferredSlug,
      currentId: originalDoc?.id,
    })
  }

  if (operation === 'create' && typeof nextData?.softDeleted !== 'boolean') {
    nextData.softDeleted = false
  }

  // Authors without publishing authority cannot change the persisted
  // publication state (e.g. flipping a historical or moderator-unpublished
  // draft back to published).
  if (operation === 'update' && req.user && !canManageSubmittedLinks(req.user)) {
    nextData._status = originalDoc?._status
  }

  // Personal-first publishing: permitted creations go live immediately. An
  // explicit draft request is captured by `recordDraftIntent` before Payload's
  // `_status` default ('draft') makes intent indistinguishable from the
  // machinery's own fallback.
  if (
    operation === 'create' &&
    req.user &&
    !req.context?.explicitDraftIntent &&
    req.context?.forcePending !== true &&
    (nextData._status === undefined || nextData._status === 'draft')
  ) {
    nextData._status = 'published'
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

  if (req.user && req.user.id === authorId && Array.isArray(req.user.roles)) {
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
    editorialPriorityUntil: new Date(Date.now() + EDITORIAL_PRIORITY_DURATION_MS).toISOString(),
  }
}

const syncDerivedSignals: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const upvotes = getNumericFieldValue(data, originalDoc, 'upvotes')
  const downvotes = getNumericFieldValue(data, originalDoc, 'downvotes')
  const commentsCount = getNumericFieldValue(data, originalDoc, 'commentsCount')
  const sharesCount = getNumericFieldValue(data, originalDoc, 'sharesCount')
  const uniqueCommenters = getNumericFieldValue(data, originalDoc, 'uniqueCommenters')
  const trustedInteractions = getNumericFieldValue(data, originalDoc, 'trustedInteractions')
  const clickCount = getNumericFieldValue(data, originalDoc, 'clickCount')

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
    discoveryMomentum: clickCount * 0.35,
    editorialPriority,
    editorialPriorityUntil,
    feed: data.feed ?? originalDoc?.feed,
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

const deleteRelatedLinkClicks: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.delete({
    collection: 'link-clicks',
    where: {
      link: {
        equals: id,
      },
    },
    overrideAccess: true,
    req,
  })
}

export const Links: CollectionConfig = {
  slug: 'links',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'user', 'softDeleted', 'rankingScore', '_status'],
  },
  access: {
    read: readAccess,
    create: ({ req: { user } }) => Boolean(user),
    update: updateAccess,
    delete: deleteAccess,
  },
  versions: {
    drafts: {
      autosave: true,
      schedulePublish: true, // Enable scheduled publishing
    },
  },
  hooks: {
    beforeOperation: [recordDraftIntent],
    beforeValidate: [enforceSubfeedContentTargetAccess, prepareLink],
    beforeChange: [
      createDiscoveryBoostEnforcementHook(),
      grantEditorialPriority,
      syncDerivedSignals,
    ],
    beforeDelete: [deleteRelatedLinkClicks],
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
      name: 'aiScore',
      type: 'number',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'aiReason',
      type: 'textarea',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'source',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
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
      access: {
        create: ({ req: { user } }) => canManageSubmittedLinks(user),
        update: ({ req: { user } }) => canManageSubmittedLinks(user),
      },
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
      name: 'softDeleted',
      type: 'checkbox',
      defaultValue: false,
      index: true,
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
  authorship: false,
}
