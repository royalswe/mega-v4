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

/** Structural subset of a SubFeed doc needed to evaluate local roles. */
export interface SubfeedRosterLike {
  owner?: unknown
  moderators?: unknown
  editors?: unknown
  uploaders?: unknown
  members?: unknown
}

export interface SubfeedLocalRoles {
  owner: boolean
  moderator: boolean
  editor: boolean
  uploader: boolean
  member: boolean
}

/**
 * Resolves the effective owner of a SubFeed. Newer rows carry an explicit
 * `owner`; legacy rows fall back to the first moderator. Always read the owner
 * through this helper rather than the `owner` field directly so legacy data
 * keeps a working owner.
 */
export const resolveSubfeedOwner = (subfeed: SubfeedRosterLike): number | null => {
  const ownerId = resolveID(subfeed?.owner)
  if (ownerId !== null) return ownerId

  const moderatorIds = readRelationshipIds(subfeed?.moderators)
  return moderatorIds.length > 0 ? moderatorIds[0] : null
}

export const getSubfeedLocalRoles = (
  subfeed: SubfeedRosterLike,
  userId: number,
): SubfeedLocalRoles => {
  const moderatorIds = readRelationshipIds(subfeed?.moderators)
  const editorIds = readRelationshipIds(subfeed?.editors)
  const uploaderIds = readRelationshipIds(subfeed?.uploaders)
  const memberIds = readRelationshipIds(subfeed?.members)
  const ownerId = resolveSubfeedOwner(subfeed)

  return {
    owner: ownerId === userId,
    moderator: moderatorIds.includes(userId),
    editor: editorIds.includes(userId),
    uploader: uploaderIds.includes(userId),
    member: memberIds.includes(userId),
  }
}

/** A member OR any local role may submit content to a SubFeed. */
export const canSubmitToSubfeed = (subfeed: SubfeedRosterLike, userId: number): boolean => {
  const roles = getSubfeedLocalRoles(subfeed, userId)
  return roles.member || roles.uploader || roles.editor || roles.moderator || roles.owner
}

/** Owner or local moderator may moderate (update + delete) SubFeed content. */
export const canModerateSubfeedContent = (
  subfeed: SubfeedRosterLike,
  userId: number,
): boolean => {
  const roles = getSubfeedLocalRoles(subfeed, userId)
  return roles.owner || roles.moderator
}

/** Owner, local moderator, or local editor may curate (update) SubFeed content. */
export const canCurateSubfeedContent = (
  subfeed: SubfeedRosterLike,
  userId: number,
): boolean => {
  const roles = getSubfeedLocalRoles(subfeed, userId)
  return roles.owner || roles.moderator || roles.editor
}

/**
 * Backward-compatible alias: submitting to a SubFeed requires membership or a
 * local role. New code should use `canSubmitToSubfeed` for clarity.
 */
export const isSubfeedMemberOrModerator = (
  subfeed: SubfeedRosterLike,
  userId: number,
): boolean => canSubmitToSubfeed(subfeed, userId)
