import type { CollectionConfig } from 'payload'
import { recalculateVotes } from './hooks/recalculateVotes'

/**
 * Votes collection configuration.
 * This collection tracks user votes on links and ensures that each user can only vote once per link.
 */
export const Votes: CollectionConfig = {
  slug: 'votes',
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'link',
      type: 'relationship',
      relationTo: 'links',
    },
    {
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
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
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  hooks: {
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
