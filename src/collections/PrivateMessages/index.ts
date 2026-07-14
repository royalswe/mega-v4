import type { CollectionConfig, Where } from 'payload'

const isAdminUser = (user: { roles?: (string | null)[] | null } | null | undefined) => {
  return Boolean(user?.roles?.includes('admin'))
}

export const PrivateMessages: CollectionConfig = {
  slug: 'private-messages',
  admin: {
    useAsTitle: 'message',
    defaultColumns: ['sender', 'receiver', 'isRead', 'createdAt'],
  },
  access: {
    // Users can read messages where they are the sender or receiver
    read: ({ req: { user } }) => {
      if (!user) return false
      return {
        or: [{ sender: { equals: user.id } }, { receiver: { equals: user.id } }],
      } as Where
    },
    // Any logged in user can create a message
    create: ({ req: { user } }) => Boolean(user),
    // Only the receiver can update the isRead status to true
    update: ({ req: { user } }) => {
      if (!user) return false
      if (isAdminUser(user)) return true
      return {
        receiver: { equals: user.id },
      } as Where
    },
    // Admin only can delete messages
    delete: ({ req: { user } }) => {
      return Boolean(user?.roles?.includes('admin'))
    },
  },
  hooks: {
    beforeChange: [
      ({ data, operation, originalDoc, req }) => {
        if (operation !== 'update' || !data) return data

        // Preserve admin/server-side management paths while constraining receiver updates.
        if (!req.user || isAdminUser(req.user)) return data

        if ('sender' in data || 'receiver' in data || 'message' in data) {
          throw new Error('Only isRead can be updated by the receiver')
        }

        if ('isRead' in data) {
          if (data.isRead !== true) {
            throw new Error('isRead can only be set to true by the receiver')
          }

          if (originalDoc?.isRead === true) {
            return data
          }

          return data
        }

        return data
      },
    ],
    beforeValidate: [
      ({ data, req, operation }) => {
        // Enforce that the sender is the authenticated user
        // Always force sender to the authenticated user, ignoring any client-supplied value
        if (operation === 'create' && req.user && data) {
          data.sender = req.user.id
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'sender',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: {
        update: ({ req: { user } }) => isAdminUser(user),
      },
    },
    {
      name: 'receiver',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: {
        update: ({ req: { user } }) => isAdminUser(user),
      },
    },
    {
      name: 'message',
      type: 'textarea',
      required: true,
      access: {
        update: ({ req: { user } }) => isAdminUser(user),
      },
    },
    {
      name: 'isRead',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      access: {
        update: ({ req: { user } }) => Boolean(user),
      },
    },
  ],
}
