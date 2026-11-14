import type { Where } from 'payload'

import { canModerateCommunity } from './subfeeds'

/**
 * Unified Content Visibility policy (tickets #33 and #34).
 *
 * This module is the single source of truth for deciding *who* may read which
 * piece of content, on both `links` and `posts`. It is deliberately pure (no
 * Payload request scope) so the same policy can be shared between collection
 * `readAccess`, the Home/public feed query builders, and unit/integration
 * tests. Every helper mirrors the others:
 *
 *   - `buildCollectionReadAccessWhere` — collection-level `readAccess`
 *   - `buildPublicFeedVisibilityWhere` — anonymous/public feed queries
 *   - `isItemVisibleInPublicFeed`      — in-memory equivalent of the above
 *
 * Content is visible to the public only when it is published, not
 * soft-deleted/removed, not quarantined, and (unless the viewer opted in) not
 * NSFW.
 */

/** Collections that participate in the shared visibility policy. */
export type VisibilityCollectionSlug = 'links' | 'posts'

/** Structural subset of a Users doc needed to evaluate visibility preferences. */
export type VisibilityViewerLike =
  | {
      id?: number | string | null
      roles?: (string | null)[] | null
      settings?: { nsfw?: boolean | null } | null
    }
  | null
  | undefined

/** Structural subset of a Link/Post needed for the pure visibility predicate. */
export type VisibleItemLike = {
  _status?: string | null
  status?: string | null
  softDeleted?: boolean | null
  quarantined?: boolean | null
  nsfw?: boolean | null
  user?: number | { id?: number | null } | null
}

export interface PublicFeedVisibilityOptions {
  collection?: VisibilityCollectionSlug
  viewer?: VisibilityViewerLike
  includeNSFW?: boolean
}

/** True when the viewer has explicitly opted into NSFW content in settings. */
export const viewerAllowsNSFW = (viewer: VisibilityViewerLike): boolean =>
  viewer?.settings?.nsfw === true

/**
 * Published-and-safe filters shared by every collection. Posts express
 * soft-delete via `status: 'removed'`; links use `softDeleted`.
 */
export const buildPublishedAndSafeWhere = (
  collection: VisibilityCollectionSlug = 'links',
): Where[] => {
  if (collection === 'posts') {
    return [
      { status: { equals: 'published' } },
      { status: { not_equals: 'removed' } },
      { quarantined: { not_equals: true } },
    ]
  }

  return [
    { _status: { equals: 'published' } },
    { softDeleted: { not_equals: true } },
    { quarantined: { not_equals: true } },
  ]
}

/**
 * Visibility filters for public/anonymous feeds: published, safe, and
 * non-NSFW unless the viewer opted in (or the caller explicitly asked for
 * NSFW content).
 */
export const buildPublicFeedVisibilityWhere = (
  options: PublicFeedVisibilityOptions = {},
): Where[] => {
  const filters = buildPublishedAndSafeWhere(options.collection ?? 'links')
  const includeNSFW = options.includeNSFW ?? viewerAllowsNSFW(options.viewer)

  if (!includeNSFW) {
    filters.push({ nsfw: { not_equals: true } })
  }

  return filters
}

/**
 * Collection-level `readAccess` delegate shared by `Links` and `Posts`.
 *
 * - Guests may only read published-and-safe content.
 * - Moderators/admins/editors may read everything.
 * - Authenticated members may read published content plus their own drafts
 *   (links) / pending posts, but never soft-deleted, removed, or quarantined
 *   content.
 */
export const buildCollectionReadAccessWhere = (
  collection: VisibilityCollectionSlug,
  user: VisibilityViewerLike,
): boolean | Where => {
  if (!user) {
    return { and: buildPublishedAndSafeWhere(collection) }
  }

  if (canModerateCommunity(user)) {
    return true
  }

  if (collection === 'posts') {
    return {
      and: [
        { quarantined: { not_equals: true } },
        { status: { not_equals: 'removed' } },
        {
          or: [
            { status: { equals: 'published' } },
            {
              and: [{ status: { equals: 'pending' } }, { user: { equals: user.id } }],
            },
          ],
        },
      ],
    }
  }

  return {
    and: [
      { softDeleted: { not_equals: true } },
      { quarantined: { not_equals: true } },
      {
        or: [{ _status: { equals: 'published' } }, { user: { equals: user.id } }],
      },
    ],
  }
}

/**
 * Pure in-memory equivalent of `buildPublicFeedVisibilityWhere`. Callers that
 * already hold a document (e.g. a rendered feed item) can use this without
 * round-tripping through the query builder.
 */
export const isItemVisibleInPublicFeed = (
  item: VisibleItemLike,
  options: PublicFeedVisibilityOptions = {},
): boolean => {
  const collection = options.collection ?? 'links'

  if (collection === 'posts') {
    // `status: 'published'` already excludes `'removed'` (and `'pending'`).
    if (item.status !== 'published' || item.quarantined === true) {
      return false
    }
  } else if (
    item._status !== 'published' ||
    item.softDeleted === true ||
    item.quarantined === true
  ) {
    return false
  }

  const includeNSFW = options.includeNSFW ?? viewerAllowsNSFW(options.viewer)
  if (!includeNSFW && item.nsfw === true) {
    return false
  }

  return true
}
