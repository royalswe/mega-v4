import type { CollectionConfig } from 'payload'

export const Links: CollectionConfig = {
  slug: 'links',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'user', '_status'],
  },
  versions: {
    drafts: {
      autosave: true,
      schedulePublish: true, // Enable scheduled publishing
    },
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'url',
      type: 'text',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'nsfw',
      type: 'checkbox',
    },
    {
      name: 'type',
      type: 'select',
      options: [
        {
          label: 'Article',
          value: 'article',
        },
        {
          label: 'Video',
          value: 'video',
        },
        {
          label: 'Image',
          value: 'image',
        },
        {
          label: 'Audio',
          value: 'audio',
        },
        {
          label: 'Game',
          value: 'game',
        },
      ],
      defaultValue: 'article',
      required: true,
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'votes',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true }, // Admin can't manually cheat the votes
    },
    // VIRTUAL: This shows comments in the UI without storing an array of IDs
    {
      name: 'relatedComments',
      type: 'join',
      collection: 'comments',
      on: 'link',
      admin: {
        description: 'Comments related to this link',
        defaultColumns: ['comment', 'user'],
      },
    },
    // VIRTUAL: This shows who bookmarked it
    {
      name: 'saves',
      type: 'join',
      collection: 'bookmarks',
      on: 'link',
      admin: {
        description: 'Users who bookmarked this link',
        defaultColumns: ['user'],
      },
    },
  ],
}
