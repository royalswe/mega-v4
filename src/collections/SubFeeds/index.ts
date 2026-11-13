import type {
  Access,
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload'

import { checkRole } from '@/access/checkRole'
import { getSubfeedEligibilityForUser } from '@/lib/community/subfeedEligibility'
import { canModerateSubfeedContent, resolveSubfeedOwner } from '@/lib/community/subfeeds'
import type { SubfeedRosterLike } from '@/lib/community/subfeeds'
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

const preservesOwner = (
  data: SubfeedRosterLike | undefined,
  originalDoc: SubfeedRosterLike,
): boolean => {
  const ownerId = resolveSubfeedOwner(originalDoc)
  return (
    (data?.owner === undefined || resolveID(data.owner) === resolveID(originalDoc.owner)) &&
    (data?.moderators === undefined ||
      ownerId === null ||
      normalizeIds(data.moderators).includes(ownerId)) &&
    (data?.members === undefined ||
      ownerId === null ||
      normalizeIds(data.members).includes(ownerId))
  )
}

/**
 * SubFeed creation is gated behind earned community standing. Site admins
 * bypass; everyone else must meet the uploader/editor candidacy or strong
 * recruiter thresholds computed by `evaluateSubfeedEligibility`. We read the
 * acting user's own profile with `overrideAccess: true` (reading one's own
 * standing fields for gating is fine) and never run the eligibility logic as
 * admin.
 */
const canCreateSubfeed: Access = async ({ req }) => {
  const { user } = req
  if (!user) return false

  if (checkRole(['admin'], user)) return true

  const userId = resolveID(user.id)
  if (!userId) return false

  const eligibility = await getSubfeedEligibilityForUser(req.payload, userId, req)
  if (!eligibility) return false

  return eligibility.eligible
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

  if (canModerateSubfeedContent(subfeed, user.id)) {
    return preservesOwner(data, subfeed)
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

const attachCreatorToCommunity: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (
    operation === 'update' &&
    req.user &&
    !canModerate(req.user) &&
    !preservesOwner(data, originalDoc)
  ) {
    throw new Error('You cannot change the owner or remove the owner from moderators or members')
  }
  if (operation !== 'create' || !req.user) return data

  const creatorId = req.user.id

  const owner = canModerate(req.user) ? (resolveID(data?.owner) ?? creatorId) : creatorId

  const moderators = Array.from(new Set([...normalizeIds(data?.moderators), owner, creatorId]))
  const members = Array.from(new Set([...normalizeIds(data?.members), owner, creatorId]))

  return {
    ...data,
    owner,
    moderators,
    members,
  }
}

const rewardRecruitment: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (req.context.skipHooks || !req.user || !previousDoc) return

  const rosterChanged = (['moderators', 'editors', 'uploaders'] as const).some(
    (field) =>
      JSON.stringify(normalizeIds(doc[field])) !== JSON.stringify(normalizeIds(previousDoc[field])),
  )
  if (rosterChanged) return

  const previousMembers = new Set(normalizeIds(previousDoc.members))
  const nextMembers = new Set(normalizeIds(doc.members))

  if (!previousMembers.has(req.user.id) && nextMembers.has(req.user.id)) {
    await bumpUserSignals(req, req.user.id, {
      recruiterScore: 1,
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
    create: canCreateSubfeed,
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
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      access: {
        update: ({ req: { user } }) => canModerate(user),
      },
      admin: {
        description:
          'The SubFeed owner. Governs local roles and roster. Defaults to the creator; legacy rows fall back to the first moderator.',
        position: 'sidebar',
      },
    },
    {
      name: 'moderators',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      required: true,
    },
    {
      name: 'editors',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      defaultValue: [],
      admin: {
        description: 'Local editors can curate (update) content within this SubFeed only.',
      },
    },
    {
      name: 'uploaders',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      defaultValue: [],
      admin: {
        description: 'Local uploaders can submit content to this SubFeed.',
      },
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
  versions: false,
  authorship: false,
}
