import type { Access, CollectionConfig } from 'payload'

import { checkRole } from '@/access/checkRole'

const canModerateMedia = (user: Parameters<typeof checkRole>[1]) =>
  checkRole(['admin', 'moderator', 'editor'], user)

const ownerOrModerator: Access = ({ req: { user } }) => {
  if (!user) return false
  if (canModerateMedia(user)) return true

  return {
    uploadedBy: {
      equals: user.id,
    },
  }
}

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ownerOrModerator,
    delete: ownerOrModerator,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    {
      name: 'uploadedBy',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
      access: {
        // Set by hook; protect from client tampering.
        update: ({ req: { user } }) => canModerateMedia(user),
      },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation, req }) => {
        if (operation === 'create' && req.user && !data?.uploadedBy) {
          return { ...data, uploadedBy: req.user.id }
        }
        return data
      },
    ],
  },
  upload: true,
}
