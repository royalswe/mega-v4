import type { CollectionConfig } from 'payload'

export const Comments: CollectionConfig = {
  slug: 'comments',
  admin: {
    useAsTitle: 'comment',
    defaultColumns: ['comment', 'user', 'link', 'createdAt'],
    group: 'Social', // Organizes the sidebar for a better demo
  },
  // We removed ALL hooks. No more updateLinkOnCommentChange!
  fields: [
    {
      name: 'comment',
      type: 'textarea',
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
      required: true,
      index: true, // Crucial for performance in the long list
    },
  ],
}
