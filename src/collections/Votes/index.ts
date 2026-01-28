import type { CollectionConfig } from 'payload'

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
}