import { checkRole } from '@/access/checkRole'
import { resolveID } from '@/lib/community/userSignals'

export const canModerateCommunity = (user: unknown): boolean => {
  return Boolean(
    user &&
    typeof user === 'object' &&
    checkRole(['admin', 'moderator', 'editor'], user as Parameters<typeof checkRole>[1]),
  )
}

export const canManageSubmittedLinks = (user: unknown): boolean => {
  return Boolean(
    user &&
    typeof user === 'object' &&
    checkRole(
      ['admin', 'moderator', 'editor', 'uploader'],
      user as Parameters<typeof checkRole>[1],
    ),
  )
}

export const readRelationshipIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return []

  return value.map(resolveID).filter((item): item is number => typeof item === 'number')
}

export const isSubfeedMemberOrModerator = (
  subfeed: {
    members?: unknown
    moderators?: unknown
  },
  userId: number,
): boolean => {
  if (readRelationshipIds(subfeed.members).includes(userId)) {
    return true
  }

  return readRelationshipIds(subfeed.moderators).includes(userId)
}
