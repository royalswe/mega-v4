import type { CollectionConfig } from 'payload'

import { checkRole } from '@/access/checkRole'
import { resolveID } from '@/lib/community/userSignals'

export const Bookmarks: CollectionConfig = {
  slug: 'bookmarks',
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
    update: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['admin', 'moderator', 'editor'], user)) return true

      return {
        user: {
          equals: user.id,
        },
      }
    },
    delete: ({ req: { user } }) => {
      if (!user) return false
      if (checkRole(['admin', 'moderator', 'editor'], user)) return true

      return {
        user: {
          equals: user.id,
        },
      }
    },
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
  ],
  hooks: {
    beforeChange: [
      ({ data, req }) => {
        if (!req.user) return data
        if (checkRole(['admin', 'moderator'], req.user)) return data

        return {
          ...data,
          user: resolveID(req.user) || data?.user,
        }
      },
    ],
    beforeValidate: [
      ({ data }) => {
        // Ensure either link or post is provided, but not both
        const hasLink = !!data?.link
        const hasPost = !!data?.post

        if (!hasLink && !hasPost) {
          throw new Error('Either link or post must be provided')
        }

        if (hasLink && hasPost) {
          throw new Error('Cannot bookmark both link and post simultaneously')
        }

        return data
      },
    ],
  },
}
