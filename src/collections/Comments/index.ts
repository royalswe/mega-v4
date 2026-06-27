import type {
  Access,
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  Where,
} from 'payload'

import { checkRole } from '@/access/checkRole'
import { recalculateTargetSignals } from '@/lib/community/contentSignals'
import { calculateControversyScore } from '@/lib/community/ranking'
import { bumpUserSignals, resolveID } from '@/lib/community/userSignals'

const canModerate = (user: unknown): boolean => {
  return Boolean(
    user &&
    typeof user === 'object' &&
    checkRole(['admin', 'moderator', 'editor'], user as Parameters<typeof checkRole>[1]),
  )
}

const readAccess: Access = ({ req: { user } }) => {
  if (!user) {
    return {
      moderationStatus: {
        equals: 'visible',
      },
    } as Where
  }

  if (canModerate(user)) return true

  return {
    or: [
      {
        moderationStatus: {
          equals: 'visible',
        },
      },
      {
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
      },
    ],
  } as Where
}

const updateAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (canModerate(user)) return true

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
  } as Where
}

const syncCommentScore: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
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

  return {
    ...data,
    score: upvotes - downvotes,
    controversyScore: calculateControversyScore({ upvotes, downvotes }),
  }
}

const afterCommentChange: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  const targetCollection = doc.link ? 'links' : doc.post ? 'posts' : null
  const targetId = resolveID(doc.link || doc.post)

  if (targetCollection && targetId) {
    await recalculateTargetSignals({ req, targetCollection, targetId })
  }

  const actorId = resolveID(doc.user)
  if (operation === 'create') {
    await bumpUserSignals(req, actorId, { interactionScore: 2, securityScore: 0.1 })
  }

  if (
    previousDoc &&
    previousDoc.moderationStatus !== 'removed' &&
    doc.moderationStatus === 'removed' &&
    actorId
  ) {
    await bumpUserSignals(req, actorId, { interactionScore: -1, securityScore: -0.2 })
  }
}

const afterCommentDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const targetCollection = doc.link ? 'links' : doc.post ? 'posts' : null
  const targetId = resolveID(doc.link || doc.post)

  if (targetCollection && targetId) {
    await recalculateTargetSignals({ req, targetCollection, targetId })
  }

  await bumpUserSignals(req, resolveID(doc.user), { interactionScore: -1 })
}

export const Comments: CollectionConfig = {
  slug: 'comments',
  admin: {
    useAsTitle: 'comment',
    defaultColumns: ['comment', 'user', 'link', 'post', 'moderationStatus', 'createdAt'],
    group: 'Social', // Organizes the sidebar for a better demo
  },
  access: {
    read: readAccess,
    create: ({ req: { user } }) => Boolean(user),
    update: updateAccess,
    delete: updateAccess,
  },
  fields: [
    {
      name: 'comment',
      type: 'richText',
      required: true,
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: {
        position: 'sidebar', // Puts the author in the right sidebar like a real app
      },
    },
    {
      name: 'link',
      type: 'relationship',
      relationTo: 'links',
      index: true,
    },
    {
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
      index: true,
    },
    {
      name: 'parentComment',
      type: 'relationship',
      relationTo: 'comments',
      index: true,
    },
    {
      name: 'upvotes',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'downvotes',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'score',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'controversyScore',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'moderationStatus',
      type: 'select',
      defaultValue: 'visible',
      index: true,
      options: [
        {
          label: 'Visible',
          value: 'visible',
        },
        {
          label: 'Pending Review',
          value: 'pending',
        },
        {
          label: 'Removed',
          value: 'removed',
        },
      ],
      access: {
        create: ({ req: { user } }) => canModerate(user),
        update: ({ req: { user } }) => canModerate(user),
      },
    },
  ],
  hooks: {
    beforeChange: [syncCommentScore],
    beforeValidate: [
      ({ data }) => {
        // Ensure either link or post is provided, but not both
        const hasLink = !!data?.link
        const hasPost = !!data?.post

        if (!hasLink && !hasPost) {
          throw new Error('Either link or post must be provided')
        }

        if (hasLink && hasPost) {
          throw new Error('Cannot comment on both link and post simultaneously')
        }

        return data
      },
    ],
    afterChange: [afterCommentChange],
    afterDelete: [afterCommentDelete],
  },
}
