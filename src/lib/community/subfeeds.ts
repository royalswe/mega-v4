import type {
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
  Payload,
} from 'payload'

import { checkRole } from '@/access/checkRole'
import { resolveID } from '@/lib/community/userSignals'
import type { User } from '@/payload-types'

export const SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE =
  'You need a local publishing role (uploader, editor, moderator, or owner) to publish to this SubFeed.'

export const MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE =
  'Only site editors, uploaders, moderators, and administrators can publish directly to the Main Feed.'

export const FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE = 'You can only publish to your own User Feed.'

/** Destination selector shared by the submission actions and the UI (#24). */
export type PublishingFeedKind = 'user' | 'subfeed' | 'main'

export interface EligibleSubfeedOption {
  id: number
  name: string
  slug: string
}

export interface PublishingDestinationEligibility {
  defaultFeed: 'user'
  allowedFeeds: PublishingFeedKind[]
  canPublishToMain: boolean
  eligibleSubfeeds: EligibleSubfeedOption[]
  hasMultipleDestinations: boolean
}

export type PublicationVisibilityState = 'published' | 'pending' | 'blocked'

export interface SubmissionOutcome {
  kind: 'link' | 'post'
  id: number
  title: string
  feed: PublishingFeedKind
  visibility: PublicationVisibilityState
  isPublic: boolean
  itemHref: string | null
  destinationHref: string
  destinationLabel: string
  subfeed?: EligibleSubfeedOption
  authorUsername: string
}

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

/**
 * A local publishing role is required to submit content to a SubFeed.
 * Membership (`roles.member`) is for joining/reading/participating only.
 */
export const canSubmitToSubfeed = (subfeed: SubfeedRosterLike, userId: number): boolean => {
  const roles = getSubfeedLocalRoles(subfeed, userId)
  return roles.uploader || roles.editor || roles.moderator || roles.owner
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
 * Guards target changes for existing content. Site-wide moderators may retarget
 * anything; other actors may only change destination/author when they moderate
 * the *original* SubFeed. Authors editing their own work are held to the
 * personal-first publishing policy: they cannot hand their item to another
 * member, publish straight to the Main Feed, or move into a SubFeed where they
 * hold no local publishing role.
 */
export const enforceSubfeedContentTargetAccess: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (req?.context?.skipHooks) return data
  if (operation !== 'update' || !req.user) return data
  if (canModerateCommunity(req.user)) return data

  const changesUser =
    data?.user !== undefined && resolveID(data.user) !== resolveID(originalDoc?.user)
  const changesFeed = data?.feed !== undefined && data.feed !== originalDoc?.feed
  const changesSubfeed =
    data?.subfeed !== undefined && resolveID(data.subfeed) !== resolveID(originalDoc?.subfeed)
  if (!changesUser && !changesFeed && !changesSubfeed) return data

  const isOriginalAuthor = resolveID(originalDoc?.user) === req.user.id

  if (!isOriginalAuthor) {
    // Acting on another member's content stays a moderation action, scoped to
    // the SubFeed the content currently lives in.
    const subfeedId = resolveID(originalDoc?.subfeed)
    const subfeed = subfeedId
      ? await req.payload.findByID({
          collection: 'subfeeds',
          id: subfeedId,
          depth: 0,
          overrideAccess: true,
          req,
        })
      : null
    if (!subfeed || !canModerateSubfeedContent(subfeed, req.user.id)) {
      throw new Error("Only moderators can change another member's content feed, subfeed, or author")
    }

    // Local moderation authority never permits handing authorship to a third
    // party: content may only stay with its author or move to the moderator.
    if (changesUser) {
      const nextAuthor = resolveID(data.user)
      if (nextAuthor !== resolveID(originalDoc?.user) && nextAuthor !== req.user.id) {
        throw new Error(FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE)
      }
    }

    return data
  }

  if (changesUser && resolveID(data.user) !== req.user.id) {
    throw new Error(FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE)
  }

  const targetFeed = data?.feed ?? originalDoc?.feed

  if (targetFeed === 'main' && changesFeed && !canManageSubmittedLinks(req.user)) {
    throw new Error(MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE)
  }

  if (targetFeed === 'subfeed' && (changesFeed || changesSubfeed)) {
    const targetSubfeedId = resolveID(data?.subfeed ?? originalDoc?.subfeed)
    if (targetSubfeedId) {
      const targetSubfeed = await req.payload.findByID({
        collection: 'subfeeds',
        id: targetSubfeedId,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (!canSubmitToSubfeed(targetSubfeed, req.user.id)) {
        throw new Error(SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE)
      }
    }
  }

  return data
}

/**
 * Backward-compatible alias: submitting to a SubFeed requires a local publishing
 * role. New code should use `canSubmitToSubfeed` for clarity.
 */
export const isSubfeedMemberOrModerator = (
  subfeed: SubfeedRosterLike,
  userId: number,
): boolean => canSubmitToSubfeed(subfeed, userId)

export interface PublishingActor {
  id?: number | string
  roles?: (string | null)[] | null
}

export interface EligibleSubfeedSource extends SubfeedRosterLike {
  id: number
  name: string
  slug: string
}

/**
 * Single authoritative destination contract for submission forms (#24). Always
 * defaults to the member's own User Feed; SubFeeds appear only where the member
 * holds a local publishing role, and the Main Feed only for site publishers.
 */
export const getPublishingDestinationEligibility = (
  user: PublishingActor | null | undefined,
  subfeeds: EligibleSubfeedSource[],
): PublishingDestinationEligibility => {
  const userId = resolveID(user)
  const canPublishToMain = canManageSubmittedLinks(user)
  const canModerateEverySubfeed = canModerateCommunity(user)

  const eligibleSubfeeds = subfeeds
    .filter(
      (subfeed) =>
        canModerateEverySubfeed || (userId !== null && canSubmitToSubfeed(subfeed, userId)),
    )
    .map((subfeed) => ({ id: subfeed.id, name: subfeed.name, slug: subfeed.slug }))

  const allowedFeeds: PublishingFeedKind[] = ['user']
  if (eligibleSubfeeds.length > 0) allowedFeeds.push('subfeed')
  if (canPublishToMain) allowedFeeds.push('main')

  return {
    defaultFeed: 'user',
    allowedFeeds,
    canPublishToMain,
    eligibleSubfeeds,
    hasMultipleDestinations: allowedFeeds.length > 1,
  }
}

export const loadPublishingDestinationEligibility = async (
  payload: Payload,
  user: PublishingActor | null | undefined,
): Promise<PublishingDestinationEligibility> => {
  const userId = resolveID(user)
  if (userId === null) return getPublishingDestinationEligibility(user, [])

  const subfeeds: EligibleSubfeedSource[] = []
  let page = 1
  let hasNextPage = true
  while (hasNextPage) {
    const result = await payload.find({
      collection: 'subfeeds',
      where: canModerateCommunity(user)
        ? undefined
        : {
            or: [
              { owner: { equals: userId } },
              { moderators: { in: [userId] } },
              { editors: { in: [userId] } },
              { uploaders: { in: [userId] } },
            ],
          },
      sort: 'name',
      depth: 0,
      limit: 200,
      page,
      user: user as User,
      overrideAccess: false,
    })
    subfeeds.push(...result.docs)
    hasNextPage = result.hasNextPage
    page += 1
  }

  return getPublishingDestinationEligibility(user, subfeeds)
}

export interface PersistedPublicationDoc {
  _status?: unknown
  status?: unknown
  softDeleted?: unknown
  quarantined?: unknown
}

/**
 * Derives the publication state the UI should report from a persisted document
 * (never from the requested destination).
 */
export const derivePersistedPublicationState = (
  kind: 'link' | 'post',
  doc: PersistedPublicationDoc,
): PublicationVisibilityState => {
  if (kind === 'link') {
    if (doc.softDeleted === true || doc.quarantined === true) return 'blocked'
    return doc._status === 'published' ? 'published' : 'pending'
  }

  if (doc.status === 'removed' || doc.quarantined === true) return 'blocked'
  return doc.status === 'published' ? 'published' : 'pending'
}

type PublishingPolicyHookArgs = Parameters<CollectionBeforeValidateHook>[0]

/**
 * Records caller intent that a create must stay unpublished. This runs before
 * Payload applies field defaults, so an explicit `draft: true`, autosave save,
 * `_status: 'draft'`, `status: 'pending'`, or REST `?draft=true` is recorded
 * while it is still distinguishable from the machinery's own defaults.
 */
export const recordDraftIntent: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (operation !== 'create') return

  const rawArgs = args as {
    draft?: boolean
    autosave?: boolean
    data?: Record<string, unknown>
  }
  const explicit =
    rawArgs?.draft === true ||
    rawArgs?.autosave === true ||
    rawArgs?.data?._status === 'draft' ||
    rawArgs?.data?.status === 'pending' ||
    req?.query?.draft === true ||
    req?.query?.draft === 'true'

  if (explicit) {
    ;(req.context ??= {}).explicitDraftIntent = true
  }
}

/**
 * Keeps `feed` and `subfeed` coherent when a target is submitted. On update a
 * destination change away from the original SubFeed detaches the relation;
 * conversely, an explicit SubFeed target without a feed still selects the
 * SubFeed feed.
 */
export const normalizeContentDestination = <T extends Record<string, unknown>>({
  data,
  operation,
  originalDoc,
}: {
  data: T | undefined
  operation: PublishingPolicyHookArgs['operation']
  originalDoc?: PublishingPolicyHookArgs['originalDoc']
}): T => {
  const nextData: Record<string, unknown> = { ...(data ?? {}) }
  const submittedSubfeed = nextData.subfeed
  const subfeedChanged =
    submittedSubfeed === undefined
      ? false
      : resolveID(submittedSubfeed) !== resolveID(originalDoc?.subfeed)
  const effectiveFeed = nextData.feed !== undefined ? nextData.feed : originalDoc?.feed

  if (
    submittedSubfeed &&
    effectiveFeed !== 'subfeed' &&
    (operation === 'create' || subfeedChanged)
  ) {
    nextData.feed = 'subfeed'
  } else if (
    operation === 'update' &&
    nextData.feed !== undefined &&
    nextData.feed !== 'subfeed' &&
    originalDoc?.feed === 'subfeed' &&
    !subfeedChanged
  ) {
    // Leaving the SubFeed destination must not leave a stale relation behind.
    nextData.subfeed = null
  }

  return nextData as T
}

/**
 * Authoritative destination/author policy shared by the `Links` and `Posts`
 * `beforeValidate` hooks. Enforces:
 *
 * - SubFeed targets require a local publishing role for the effective author.
 * - Non-moderators may only create content under their own identity.
 * - Direct Main Feed publications require a site-wide publishing role.
 * - New content defaults to the author's User Feed.
 *
 * All nested reads thread `req` so the surrounding transaction stays intact.
 */
export const enforceContentPublishingPolicy = async <T extends Record<string, unknown>>({
  data,
  operation,
  originalDoc,
  req,
  messages,
}: {
  data: T
  operation: PublishingPolicyHookArgs['operation']
  originalDoc?: PublishingPolicyHookArgs['originalDoc']
  req: PublishingPolicyHookArgs['req']
  messages?: { missingRelation?: string; missingAuthor?: string }
}): Promise<T> => {
  const nextData: Record<string, unknown> = { ...data }
  const actor = req.user
  const missingRelationMessage =
    messages?.missingRelation ?? 'SubFeed content must include a subfeed relation'
  const missingAuthorMessage =
    messages?.missingAuthor ?? 'SubFeed content must include a valid author'

  if (operation === 'create' && nextData.feed === undefined) {
    nextData.feed = 'user'
  }

  const effectiveFeed = nextData.feed !== undefined ? nextData.feed : originalDoc?.feed
  const effectiveSubfeed =
    nextData.subfeed !== undefined ? nextData.subfeed : originalDoc?.subfeed

  if (effectiveFeed === 'subfeed') {
    const subfeedId = resolveID(effectiveSubfeed)
    if (!subfeedId) {
      if (operation === 'create') {
        throw new Error(missingRelationMessage)
      }
      nextData.feed = 'user'
    } else if (!canModerateCommunity(actor)) {
      const authorId =
        resolveID(nextData.user !== undefined ? nextData.user : originalDoc?.user) ??
        resolveID(actor?.id) ??
        null

      if (!authorId) {
        throw new Error(missingAuthorMessage)
      }

      // In-place updates (votes, comment counts, signal recalculation, curation,
      // author edits) must not re-litigate the original publishing authority.
      // Only a create or an actual destination/author change is re-checked.
      const destinationChanged =
        operation === 'create' ||
        originalDoc?.feed !== 'subfeed' ||
        resolveID(effectiveSubfeed) !== resolveID(originalDoc?.subfeed) ||
        resolveID(nextData.user !== undefined ? nextData.user : originalDoc?.user) !==
          resolveID(originalDoc?.user)

      if (destinationChanged) {
        const subfeed = await req.payload.findByID({
          collection: 'subfeeds',
          id: subfeedId,
          depth: 0,
          overrideAccess: true,
          req,
        })

        if (!canSubmitToSubfeed(subfeed, authorId)) {
          throw new Error(SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE)
        }
      }
    }
  }

  if (actor && !canModerateCommunity(actor) && operation === 'create') {
    const actorId = resolveID(actor.id)
    if (nextData.user !== undefined && resolveID(nextData.user) !== actorId) {
      throw new Error(FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE)
    }
    nextData.user = actor.id
  }

  if (
    effectiveFeed === 'main' &&
    actor &&
    (operation === 'create' || originalDoc?.feed !== 'main') &&
    !canManageSubmittedLinks(actor)
  ) {
    throw new Error(MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE)
  }

  return nextData as T
}
