import type { Access, CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { checkRole } from '@/access/checkRole'

const readAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (checkRole(['admin', 'moderator', 'editor'], user)) return true

  return {
    user: {
      equals: user.id,
    },
  }
}

const ensureDiscoveredAt: CollectionBeforeValidateHook = ({ data }) => {
  return {
    ...data,
    discoveredAt: data?.discoveredAt || new Date().toISOString(),
  }
}

export const Discoveries: CollectionConfig = {
  slug: 'discoveries',
  admin: {
    group: 'Community',
    defaultColumns: ['user', 'post', 'engagementGenerated', 'discoveredAt'],
  },
  access: {
    read: readAccess,
    create: ({ req: { user } }) => checkRole(['admin', 'moderator', 'editor'], user),
    update: ({ req: { user } }) => checkRole(['admin', 'moderator', 'editor'], user),
    delete: ({ req: { user } }) => checkRole(['admin', 'moderator', 'editor'], user),
  },
  hooks: {
    beforeValidate: [ensureDiscoveredAt],
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
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
      required: true,
      index: true,
    },
    {
      name: 'discoveredAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
    },
    {
      name: 'engagementGenerated',
      type: 'number',
      defaultValue: 0,
      index: true,
    },
  ],
}
