import type { CollectionConfig } from 'payload'

export const Bookmarks: CollectionConfig = {
  slug: 'bookmarks',
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
