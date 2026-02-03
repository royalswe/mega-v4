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
      required: true,
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
    afterChange: [recalculateVotes], // Recalculate votes after a vote is created or updated
    afterDelete: [recalculateVotes], // Recalculate votes after a vote is deleted
  },
}
