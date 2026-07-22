import type {
  Access,
  CollectionAfterChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload'

import { checkRole } from '@/access/checkRole'
import { bumpUserSignals, resolveID } from '@/lib/community/userSignals'

const hideTargetForReport = async ({
  req,
  targetType,
  targetPostId,
  targetCommentId,
  targetLinkId,
}: {
  req: Parameters<CollectionAfterChangeHook>[0]['req']
  targetType: 'post' | 'comment' | 'link' | 'user'
  targetPostId: number | null
  targetCommentId: number | null
  targetLinkId: number | null
}): Promise<void> => {
  if (targetType === 'post' && targetPostId) {
    await req.payload.update({
      collection: 'posts',
      id: targetPostId,
      data: { status: 'pending' },
      overrideAccess: true,
      req,
    })
  }

  if (targetType === 'comment' && targetCommentId) {
    await req.payload.update({
      collection: 'comments',
      id: targetCommentId,
      data: { moderationStatus: 'pending' },
      overrideAccess: true,
      req,
    })
  }

  if (targetType === 'link' && targetLinkId) {
    await req.payload.update({
      collection: 'links',
      id: targetLinkId,
      data: { softDeleted: true },
      overrideAccess: true,
      req,
    })
  }
}

const restoreTargetForReport = async ({
  req,
  targetType,
  targetPostId,
  targetCommentId,
  targetLinkId,
}: {
  req: Parameters<CollectionAfterChangeHook>[0]['req']
  targetType: 'post' | 'comment' | 'link' | 'user'
  targetPostId: number | null
  targetCommentId: number | null
  targetLinkId: number | null
}): Promise<void> => {
  if (targetType === 'post' && targetPostId) {
    await req.payload.update({
      collection: 'posts',
      id: targetPostId,
      data: { status: 'published' },
      overrideAccess: true,
      req,
    })
  }

  if (targetType === 'comment' && targetCommentId) {
    await req.payload.update({
      collection: 'comments',
      id: targetCommentId,
      data: { moderationStatus: 'visible' },
      overrideAccess: true,
      req,
    })
  }

  if (targetType === 'link' && targetLinkId) {
    await req.payload.update({
      collection: 'links',
      id: targetLinkId,
      data: { softDeleted: false },
      overrideAccess: true,
      req,
    })
  }
}

const canReview = (user: unknown): boolean => {
  return Boolean(
    user &&
    typeof user === 'object' &&
    checkRole(['admin', 'moderator', 'editor'], user as Parameters<typeof checkRole>[1]),
  )
}

const readAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (canReview(user)) return true

  return {
    reporter: {
      equals: user.id,
    },
  }
}

const prepareReport: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (!data) return data

  const next = { ...data }

  if (!next.reporter && req.user) {
    next.reporter = req.user.id
  }

  const type = next.targetType
  const targetPostId = resolveID(next.targetPost)
  const targetCommentId = resolveID(next.targetComment)
  const targetLinkId = resolveID(next.targetLink)
  const targetUserId = resolveID(next.targetUser)

  if (!next.targetId) {
    if (type === 'post' && targetPostId) next.targetId = String(targetPostId)
    if (type === 'comment' && targetCommentId) next.targetId = String(targetCommentId)
    if (type === 'link' && targetLinkId) next.targetId = String(targetLinkId)
    if (type === 'user' && targetUserId) next.targetId = String(targetUserId)
  }

  if (operation === 'create' && req.user) {
    const reporter = await req.payload.findByID({
      collection: 'users',
      id: req.user.id,
      depth: 0,
      overrideAccess: true,
      req,
    })

    const trusted =
      checkRole(['admin', 'moderator', 'editor'], req.user) ||
      ['trusted', 'veteran', 'curator', 'pillar', 'legend'].includes(reporter?.trustLevel ?? '')

    next.fastTracked = trusted
  }

  return next
}

const applyReportDecision: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const targetPostId = resolveID(doc.targetPost)
  const targetCommentId = resolveID(doc.targetComment)
  const targetLinkId = resolveID(doc.targetLink)

  if (doc.fastTracked && previousDoc == null) {
    await hideTargetForReport({
      req,
      targetType: doc.targetType,
      targetPostId,
      targetCommentId,
      targetLinkId,
    })
  }

  if (doc.status === 'approved' && previousDoc?.status !== 'approved') {
    if (doc.targetType === 'post' && targetPostId) {
      await req.payload.update({
        collection: 'posts',
        id: targetPostId,
        data: {
          status: 'removed',
        },
        overrideAccess: true,
        req,
      })
    }

    if (doc.targetType === 'comment' && targetCommentId) {
      await req.payload.update({
        collection: 'comments',
        id: targetCommentId,
        data: {
          moderationStatus: 'removed',
        },
        overrideAccess: true,
        req,
      })
    }

    if (doc.targetType === 'link' && targetLinkId) {
      await req.payload.update({
        collection: 'links',
        id: targetLinkId,
        data: {
          softDeleted: true,
        },
        overrideAccess: true,
        req,
      })
    }

    await bumpUserSignals(req, resolveID(doc.reporter), {
      moderationScore: doc.fastTracked ? 3 : 2,
      cleaningScore: doc.fastTracked ? 3 : 2,
    })

    await bumpUserSignals(req, resolveID(doc.reviewedBy), {
      moderationScore: 1,
      cleaningScore: 1,
    })

    return
  }

  if (doc.status === 'rejected' && previousDoc?.status !== 'rejected') {
    await restoreTargetForReport({
      req,
      targetType: doc.targetType,
      targetPostId,
      targetCommentId,
      targetLinkId,
    })

    await bumpUserSignals(req, resolveID(doc.reporter), {
      moderationScore: doc.fastTracked ? -2 : -1,
      cleaningScore: doc.fastTracked ? -2 : -1,
    })

    await bumpUserSignals(req, resolveID(doc.reviewedBy), {
      moderationScore: -1,
      cleaningScore: -1,
    })

    return
  }
}

export const Reports: CollectionConfig = {
  slug: 'reports',
  admin: {
    useAsTitle: 'targetId',
    group: 'Community',
    defaultColumns: ['targetType', 'reason', 'status', 'fastTracked', 'createdAt'],
  },
  access: {
    read: readAccess,
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => canReview(user),
    delete: ({ req: { user } }) => canReview(user),
  },
  hooks: {
    beforeValidate: [prepareReport],
    afterChange: [applyReportDecision],
  },
  fields: [
    {
      name: 'reporter',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'targetType',
      type: 'select',
      required: true,
      options: [
        {
          label: 'Post',
          value: 'post',
        },
        {
          label: 'Comment',
          value: 'comment',
        },
        {
          label: 'Link',
          value: 'link',
        },
        {
          label: 'User',
          value: 'user',
        },
      ],
    },
    {
      name: 'targetId',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'targetPost',
      type: 'relationship',
      relationTo: 'posts',
      admin: {
        condition: (_, siblingData) => siblingData.targetType === 'post',
      },
    },
    {
      name: 'targetComment',
      type: 'relationship',
      relationTo: 'comments',
      admin: {
        condition: (_, siblingData) => siblingData.targetType === 'comment',
      },
    },
    {
      name: 'targetLink',
      type: 'relationship',
      relationTo: 'links',
      admin: {
        condition: (_, siblingData) => siblingData.targetType === 'link',
      },
    },
    {
      name: 'targetUser',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        condition: (_, siblingData) => siblingData.targetType === 'user',
      },
    },
    {
      name: 'reason',
      type: 'select',
      required: true,
      defaultValue: 'spam',
      options: [
        {
          label: 'Spam',
          value: 'spam',
        },
        {
          label: 'Abuse',
          value: 'abuse',
        },
        {
          label: 'Broken Link',
          value: 'broken_link',
        },
        {
          label: 'Harassment',
          value: 'harassment',
        },
        {
          label: 'NSFW Mismatch',
          value: 'nsfw',
        },
        {
          label: 'Other',
          value: 'other',
        },
      ],
    },
    {
      name: 'details',
      type: 'textarea',
      maxLength: 1200,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
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
          label: 'Rejected',
          value: 'rejected',
        },
      ],
    },
    {
      name: 'reviewedBy',
      type: 'relationship',
      relationTo: 'users',
      access: {
        update: ({ req: { user } }) => canReview(user),
      },
    },
    {
      name: 'fastTracked',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
      },
    },
  ],
}
