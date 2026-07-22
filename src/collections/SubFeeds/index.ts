import type {
  Access,
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload'

import { checkRole } from '@/access/checkRole'
import { bumpUserSignals } from '@/lib/community/userSignals'
import { resolveID } from '@/lib/community/userSignals'

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

const canModerate = (user: unknown): boolean => {
  return Boolean(
    user &&
    typeof user === 'object' &&
    checkRole(['admin', 'moderator', 'editor'], user as Parameters<typeof checkRole>[1]),
  )
}

const normalizeIds = (values: unknown): number[] => {
  if (!Array.isArray(values)) return []

  return values.map(resolveID).filter((value): value is number => typeof value === 'number')
}

const canManageSubfeed: Access = async ({ id, req, data }) => {
  const { user } = req
  if (!user) return false
  if (canModerate(user)) return true
  if (!id) return false

  const numericId = resolveID(id)
  if (!numericId) return false

  const subfeed = await req.payload.findByID({
    collection: 'subfeeds',
    id: numericId,
    depth: 0,
    overrideAccess: true,
    req,
  })

  if (!subfeed) return false

  const moderatorIds = Array.isArray(subfeed.moderators)
    ? subfeed.moderators
        .map(resolveID)
        .filter((value): value is number => typeof value === 'number')
    : []

  if (moderatorIds.includes(user.id)) {
    return true
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false
  }

  const incomingData = data as Record<string, unknown>
  const updateKeys = Object.keys(incomingData)

  if (updateKeys.length !== 1 || updateKeys[0] !== 'members') {
    return false
  }

  const currentMembers = normalizeIds(subfeed.members)
  const nextMembers = normalizeIds(incomingData.members)

  const currentMemberSet = new Set(currentMembers)
  const nextMemberSet = new Set(nextMembers)
  const changedMembers = new Set<number>()

  for (const memberId of currentMemberSet) {
    if (!nextMemberSet.has(memberId)) {
      changedMembers.add(memberId)
    }
  }

  for (const memberId of nextMemberSet) {
    if (!currentMemberSet.has(memberId)) {
      changedMembers.add(memberId)
    }
  }

  if (changedMembers.size === 0) {
    return true
  }

  return changedMembers.size === 1 && changedMembers.has(user.id)
}

const prepareSubfeed: CollectionBeforeValidateHook = ({ data }) => {
  if (!data) return data

  const next = { ...data }
  if (typeof next.name === 'string' && next.name.length > 0) {
    next.slug = next.slug || slugify(next.name)
  }

  return next
}

const attachCreatorToCommunity: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation !== 'create' || !req.user) return data

  const creatorId = req.user.id

  const moderators = Array.isArray(data?.moderators)
    ? Array.from(new Set([...normalizeIds(data.moderators), creatorId]))
    : [creatorId]

  const members = Array.isArray(data?.members)
    ? Array.from(new Set([...normalizeIds(data.members), creatorId]))
    : [creatorId]

  return {
    ...data,
    moderators,
    members,
  }
}

const rewardRecruitment: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (!req.user || !previousDoc) return

  const previousMembers = new Set(normalizeIds(previousDoc.members))
  const nextMembers = new Set(normalizeIds(doc.members))

  let recruitedCount = 0
  for (const memberId of nextMembers) {
    if (!previousMembers.has(memberId)) recruitedCount += 1
  }

  if (recruitedCount > 0) {
    await bumpUserSignals(req, req.user.id, {
      recruiterScore: recruitedCount,
    })
  }
}

export const SubFeeds: CollectionConfig = {
  slug: 'subfeeds',
  admin: {
    useAsTitle: 'name',
    group: 'Community',
    defaultColumns: ['name', 'featured', 'reputation', 'createdAt'],
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean(user),
    update: canManageSubfeed,
    delete: ({ req: { user } }) => canModerate(user),
  },
  hooks: {
    beforeValidate: [prepareSubfeed],
    beforeChange: [attachCreatorToCommunity],
    afterChange: [rewardRecruitment],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'description',
      type: 'textarea',
      required: true,
      maxLength: 500,
    },
    {
      name: 'avatar',
      type: 'relationship',
      relationTo: 'media',
    },
    {
      name: 'banner',
      type: 'relationship',
      relationTo: 'media',
    },
    {
      name: 'rules',
      type: 'textarea',
      maxLength: 3000,
    },
    {
      name: 'theme',
      type: 'text',
    },
    {
      name: 'moderators',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      required: true,
    },
    {
      name: 'members',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
    },
    {
      name: 'reputation',
      type: 'number',
      defaultValue: 0,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
    },
  ],
}
