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
  ],
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
          throw new Error('Cannot comment on both link and post simultaneously')
        }

        return data
      },
    ],
  },
}
