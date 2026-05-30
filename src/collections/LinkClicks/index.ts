import type { CollectionConfig } from 'payload'

import { checkRole } from '@/access/checkRole'

export const LinkClicks: CollectionConfig = {
  slug: 'link-clicks',
  admin: {
    group: 'Community',
    defaultColumns: ['link', 'user', 'fingerprint', 'createdAt'],
    useAsTitle: 'identityKey',
  },
  access: {
    read: ({ req: { user } }) => checkRole(['admin', 'moderator', 'editor'], user),
    create: () => false,
    update: () => false,
    delete: ({ req: { user } }) => checkRole(['admin'], user),
  },
  fields: [
    {
      name: 'link',
      type: 'relationship',
      relationTo: 'links',
      required: true,
      index: true,
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      index: true,
    },
    {
      name: 'fingerprint',
      type: 'text',
      index: true,
    },
    {
      name: 'identityKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
      },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        const hasUser = Boolean(data?.user)
        const hasFingerprint = typeof data?.fingerprint === 'string' && data.fingerprint.length > 0

        if (!hasUser && !hasFingerprint) {
          throw new Error('Link click requires user or fingerprint')
        }

        return data
      },
    ],
  },
}
