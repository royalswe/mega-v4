import { Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import { getTestPayload } from '../utils/test-user'
import { createTestUser } from './helpers'

/**
 * Member settings survive the standing engine.
 *
 * The users collection re-derives roles and trust on every update, so the risk is
 * not that a field can be written — it is that a standing update silently wipes
 * the member's own preferences (and vice versa).
 */

let payload: Payload

describe('User settings and standing', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('keeps preferences intact when standing signals change', async () => {
    const user = await createTestUser(payload)

    await payload.update({
      collection: 'users',
      id: user.id,
      data: { settings: { nsfw: true, language: 'sv' } },
      overrideAccess: true,
    })

    await payload.update({
      collection: 'users',
      id: user.id,
      data: { contributionScore: 200 },
      overrideAccess: true,
    })

    const fresh = await payload.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    })

    expect(fresh.settings?.nsfw).toBe(true)
    expect(fresh.settings?.language).toBe('sv')
    expect(fresh.contributionScore).toBe(200)
    expect(fresh.username).toBe(user.username)
  })

  it('derives standing roles without touching the preference fields', async () => {
    const user = await createTestUser(payload)

    await payload.update({
      collection: 'users',
      id: user.id,
      data: { settings: { nsfw: false }, contributionScore: 200, discoveryScore: 60 },
      overrideAccess: true,
    })

    const fresh = await payload.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    })

    expect(fresh.roles ?? []).toContain('uploader')
    expect(fresh.settings?.nsfw).toBe(false)
  })

  it('does not let a member write their own standing', async () => {
    const user = await createTestUser(payload)

    await payload.update({
      collection: 'users',
      id: user.id,
      data: { contributionScore: 9_999 },
      user,
      overrideAccess: false,
    })

    const fresh = await payload.findByID({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
    })

    expect(fresh.contributionScore ?? 0).toBeLessThan(9_999)
  })
})
