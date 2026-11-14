import type { CollectionBeforeChangeHook } from 'payload'

import {
  BOOST_FIELD_NAMES,
  DISCOVERY_BOOST_INELIGIBLE_MESSAGE,
  DISCOVERY_BOOST_REQUIRED_MESSAGE,
  hasDiscoveryBoostStanding,
  isPublishedForPromotion,
  isSafeDiscoveryBoostTarget,
} from './promotion'
import type { PromotableItemLike } from './promotion'
import { resolveID } from './userSignals'
import { canModerateCommunity } from './subfeeds'

/**
 * Shape of the request `context.discoveryBoost` payload set by the
 * `boostToMainFeed` / `unboostFromMainFeed` server actions.
 *
 * This is the sanctioned escape hatch around `overrideAccess: true`: the action
 * writes with `overrideAccess: true` (so a discovery-standing member — who is
 * NOT an admin — can set admin-only boost fields), and this hook is the real
 * enforcement point. It re-validates the booster's standing and the target's
 * eligibility, and forces the boost fields to trusted values derived from the
 * context rather than trusting the incoming data.
 */
export interface DiscoveryBoostContext {
  userId: number | string
  /** When true, roll the boost back instead of applying it. */
  unboost?: boolean
}

/**
 * Ignore echoed values on update and empty defaults on create.
 */
const attemptsBoostWrite = (
  data: Record<string, unknown> | null | undefined,
  originalDoc: Record<string, unknown> | null | undefined,
): boolean =>
  BOOST_FIELD_NAMES.some((field) => {
    const value = data?.[field]
    if (value === undefined) return false
    if (!originalDoc) return value !== false && value !== null
    if (field === 'boostedBy') return resolveID(value) !== resolveID(originalDoc[field])
    return value !== originalDoc[field]
  })

/**
 * Builds the beforeChange hook that governs the curated discovery-boost fields
 * (`discoveryBoosted`, `boostedAt`, `boostedBy`) for a given collection.
 *
 * Two modes:
 *
 *  1. Context-gated (`req.context.discoveryBoost` present) — used by the server
 *     actions with `overrideAccess: true`. Re-validates:
 *       - the update ONLY touches boost fields;
 *       - the acting user still has boost standing (admin/moderator/editor OR
 *         decayed discovery standing) — or, for unboost, that they are a site
 *         moderator/editor or the original booster;
 *       - the target is promotion-eligible (boost only).
 *     It then writes trusted boost values derived from the context.
 *
 *  2. Context-absent — rejects any attempt by a non-admin/moderator/editor to
 *     change boost fields (e.g. a member hitting the Local API directly).
 */
export const createDiscoveryBoostEnforcementHook = (): CollectionBeforeChangeHook => {
  return async ({ data, originalDoc, operation, req }) => {
    const boostContext = req?.context?.discoveryBoost as DiscoveryBoostContext | undefined

    if (boostContext) {
      const userId = resolveID(boostContext.userId)
      if (userId === null) {
        throw new Error('Invalid discovery booster')
      }

      // The context-gated update may only touch boost fields. `data` is the
      // full sanitized document (all fields echo their existing values), so
      // detect real changes by diffing against the original document rather
      // than inspecting which keys are present.
      const foreignKeys = Object.keys(data ?? {}).filter((key) => {
        if ((BOOST_FIELD_NAMES as readonly string[]).includes(key)) return false
        return JSON.stringify(data?.[key]) !== JSON.stringify(originalDoc?.[key])
      })
      if (foreignKeys.length > 0) {
        throw new Error('Discovery boost may only update its own fields')
      }

      // Re-validate the acting user server-side (defense in depth: the action
      // already gates this, but the hook re-checks since access is bypassed).
      const booster = await req.payload.findByID({
        collection: 'users',
        id: userId,
        depth: 0,
        overrideAccess: true,
        req,
      })

      if (!booster) {
        throw new Error('Discovery booster not found')
      }

      if (boostContext.unboost) {
        const originalBoosterId = resolveID(originalDoc?.boostedBy)
        const mayUnboost =
          canModerateCommunity(booster) || originalBoosterId === userId

        if (!mayUnboost) {
          throw new Error(
            'Only the member who boosted this content or a site moderator/editor can unboost it.',
          )
        }

        return {
          ...data,
          discoveryBoosted: false,
          boostedAt: null,
          boostedBy: null,
        }
      }

      if (!hasDiscoveryBoostStanding(booster as never)) {
        throw new Error(DISCOVERY_BOOST_REQUIRED_MESSAGE)
      }

      // Re-validate publication and safety independently of organic traction.
      const target = { ...(originalDoc ?? {}), ...(data ?? {}) }
      if (!isSafeDiscoveryBoostTarget(target as PromotableItemLike)) {
        throw new Error(DISCOVERY_BOOST_INELIGIBLE_MESSAGE)
      }

      return {
        ...data,
        discoveryBoosted: true,
        boostedAt: new Date().toISOString(),
        boostedBy: userId,
      }
    }

    // No boost context: guard direct writes to boost fields.
    if (
      attemptsBoostWrite(data, operation === 'update' ? originalDoc : undefined) &&
      !canModerateCommunity(req?.user)
    ) {
      throw new Error(
        'Only site administrators, moderators, and editors can change discovery boost fields.',
      )
    }

    if (
      data?.discoveryBoosted === true &&
      attemptsBoostWrite(data, operation === 'update' ? originalDoc : undefined) &&
      !isPublishedForPromotion({ ...originalDoc, ...data })
    ) {
      throw new Error(DISCOVERY_BOOST_INELIGIBLE_MESSAGE)
    }

    return data
  }
}
