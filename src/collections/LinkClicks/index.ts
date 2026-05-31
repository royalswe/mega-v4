import type { CollectionAfterChangeHook, CollectionConfig } from 'payload'

import { checkRole } from '@/access/checkRole'

const incrementLinkClickCount: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return doc

  const linkId =
    typeof doc.link === 'number'
      ? doc.link
      : typeof doc.link === 'object' && doc.link
        ? (doc.link as { id?: number }).id
        : null

  if (!linkId) return doc

  try {
    const link = await req.payload.findByID({
      collection: 'links',
      id: linkId,
      depth: 0,
      overrideAccess: true,
      req,
    })

    if (!link) return doc

    await req.payload.update({
      collection: 'links',
      id: linkId,
      data: {
        clickCount: (link.clickCount || 0) + 1,
      },
      overrideAccess: true,
      req,
    })
  } catch (error) {
    req.payload.logger.error({ msg: 'Failed to increment link click count', err: error })
  }

  return doc
}

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
    afterChange: [incrementLinkClickCount],
  },
}
