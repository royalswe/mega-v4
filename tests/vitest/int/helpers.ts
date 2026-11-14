import { Payload } from 'payload'

import { createMember, uniqueToken } from '../../fixtures/community'

// Re-exported so specs keep a single import site, and so the fixture interface
// lives in `tests/fixtures/community.ts` rather than in a Vitest-only helper.
export {
  createFeedItem,
  createMember,
  createRichText,
  createSubfeedWithRoster,
} from '../../fixtures/community'

export type { Member } from '../../fixtures/community'

/** A member with isolated credentials and no standing. */
export const createTestUser = async (payload: Payload) => createMember(payload)

/** A published Main Feed Link authored by `userId`. */
export const createTestLink = async (payload: Payload, userId: number | string) => {
  const unique = uniqueToken(10)

  return payload.create({
    collection: 'links',
    data: {
      title: `Integration Test Link ${unique}`,
      url: `https://example.com/${unique}`,
      type: 'article',
      user: userId as number,
      _status: 'published',
    },
    overrideAccess: true,
  })
}
