import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { checkRole } from '@/access/checkRole'
import { resolveID } from '@/lib/community/userSignals'

import { recalculateVotes } from './hooks/recalculateVotes'

const ensureUniqueVote: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
  originalDoc,
}) => {
  const userId = resolveID(data?.user) || resolveID(req.user)
  const currentVoteId = resolveID(originalDoc)

  if (!userId) {
    throw new Error('Voting requires an authenticated user')
  }

  const isModerator = checkRole(['admin', 'moderator'], req.user)
  const nextData: Record<string, unknown> = {
    ...data,
    user: isModerator ? data?.user || userId : userId,
  }

  const linkId = resolveID(nextData.link)
  const postId = resolveID(nextData.post)

  if (!linkId && !postId) {
    throw new Error('Either link or post must be provided')
  }

  if (linkId && postId) {
    throw new Error('Cannot vote on both link and post simultaneously')
  }

  const where: any = {
    user: {
      equals: userId,
    },
  }

  if (linkId) {
    where.link = {
      equals: linkId,
    }
  }

  if (postId) {
    where.post = {
      equals: postId,
    }
  }

  if (operation === 'update' && currentVoteId) {
    where.id = {
      not_equals: currentVoteId,
    }
  }

  const existingVotes = await req.payload.find({
    collection: 'votes',
    where,
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })

  if (existingVotes.docs.length > 0) {
    throw new Error('You have already voted on this item')
  }

  return nextData
}

/**
 * Votes collection configuration.
 * This collection tracks user votes on links and ensures that each user can only vote once per link.
 */
export const Votes: CollectionConfig = {
  slug: 'votes',
  admin: {
    defaultColumns: ['user', 'link', 'post', 'vote', 'createdAt'],
    group: 'Social',
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
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
      name: 'vote',
      type: 'radio',
      options: [
        {
          label: 'Up',
          value: 'up',
        },
        {
          label: 'Down',
          value: 'down',
        },
      ],
      required: true,
    },
  ],
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['admin', 'moderator', 'editor'], user)) return true

      return {
        user: {
          equals: user.id,
        },
      }
    },
    create: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  hooks: {
    beforeChange: [ensureUniqueVote],
    beforeValidate: [
      ({ data }) => {
        // Ensure either link or post is provided, but not both
        const hasLink = !!data?.link
        const hasPost = !!data?.post

        if (!hasLink && !hasPost) {
          throw new Error('Either link or post must be provided')
        }

        if (hasLink && hasPost) {
          throw new Error('Cannot vote on both link and post simultaneously')
        }

        return data
      },
    ],
    afterChange: [recalculateVotes], // Recalculate votes after a vote is created or updated
    afterDelete: [recalculateVotes], // Recalculate votes after a vote is deleted
  },
}
