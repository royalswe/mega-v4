import type { CollectionConfig, Where } from 'payload'

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
        or: [
          { sender: { equals: user.id } },
          { receiver: { equals: user.id } },
        ],
      } as Where
    },
    // Any logged in user can create a message
    create: ({ req: { user } }) => Boolean(user),
    // Only the receiver can update the isRead status to true
    update: ({ req: { user } }) => {
      if (!user) return false
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
    beforeValidate: [
      ({ data, req }) => {
        // Enforce that the sender is the authenticated user
        if (req.user && data && !data.sender) {
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
    },
    {
      name: 'receiver',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'message',
      type: 'textarea',
      required: true,
    },
    {
      name: 'isRead',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },
  ],
}
