import { randomUUID } from 'node:crypto'
import type { CollectionBeforeChangeHook, Payload } from 'payload'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { assignSubfeedRole, removeSubfeedMember } from '@/app/actions/subfeeds'
import { revokeAutomaticRole } from '@/app/actions/users'
import { getAuthenticatedUser } from '@/lib/auth'
import { readRelationshipIds } from '@/lib/community/subfeeds'
import type { User } from '@/payload-types'
import { createTestUser } from './helpers'

vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('Roster PostgreSQL conflict retries', () => {
  let payload: Payload
  let admin: User

  beforeAll(async () => {
    const { getTestPayload } = await import('../utils/test-user')
    payload = await getTestPayload()
    const created = await createTestUser(payload)
    admin = await payload.update({
      collection: 'users',
      id: created.id,
      data: { roles: ['admin', 'user'], standingLocked: true },
      overrideAccess: true,
    })
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      user: { ...admin, collection: 'users' },
      payload,
    })
  })

  const createSubfeed = (members: number[] = []) => {
    const unique = randomUUID()
    return payload.create({
      collection: 'subfeeds',
      data: {
        name: `Concurrent roster ${unique}`,
        slug: `concurrent-roster-${unique}`,
        description: 'Isolated PostgreSQL roster conflict regression fixture',
        owner: admin.id,
        moderators: [admin.id],
        members: [admin.id, ...members],
      },
      overrideAccess: true,
    })
  }

  // Hold both transactions after their snapshot reads so a retry is required,
  // rather than merely hoping Promise.all happens to overlap database writes.
  const overlapWrites = async (
    collection: 'subfeeds' | 'users',
    operations: (() => Promise<void>)[],
  ) => {
    const hooks = payload.collections[collection].config.hooks!.beforeChange!
    let arrivals = 0
    let release!: () => void
    const ready = new Promise<void>((resolve) => {
      release = resolve
    })
    const barrier: CollectionBeforeChangeHook = async ({ data, req }) => {
      arrivals++
      const transactionID = await req.transactionID
      const tx = transactionID ? payload.db.sessions[transactionID]?.db : undefined
      if (!tx || !('execute' in tx)) throw new Error('Missing PostgreSQL transaction')
      const { sql } = await import('@payloadcms/db-postgres')
      const isolation = await tx.execute(sql`SHOW transaction_isolation`)
      expect(isolation.rows[0]?.transaction_isolation).toBe('serializable')
      if (arrivals <= 2) {
        if (arrivals === 2) release()
        await ready
      }
      return data
    }
    hooks.push(barrier)
    try {
      await Promise.all(operations.map((operation) => operation()))
      expect(arrivals).toBeGreaterThanOrEqual(3)
    } finally {
      hooks.splice(hooks.indexOf(barrier), 1)
    }
  }

  it('keeps both concurrent assignments to the same role', async () => {
    const first = await createTestUser(payload)
    const second = await createTestUser(payload)
    const subfeed = await createSubfeed()
    await overlapWrites('subfeeds', [
      () => assignSubfeedRole(subfeed.id, first.id, 'editor'),
      () => assignSubfeedRole(subfeed.id, second.id, 'editor'),
    ])
    const persisted = await payload.findByID({
      collection: 'subfeeds',
      id: subfeed.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(readRelationshipIds(persisted.editors).sort()).toEqual([first.id, second.id].sort())
    expect(readRelationshipIds(persisted.members).sort()).toEqual(
      [admin.id, first.id, second.id].sort(),
    )
  })

  it('keeps an assignment without resurrecting a concurrently removed member', async () => {
    const removed = await createTestUser(payload)
    const appointed = await createTestUser(payload)
    const subfeed = await createSubfeed([removed.id])
    await payload.update({
      collection: 'subfeeds',
      id: subfeed.id,
      data: { editors: [removed.id], uploaders: [removed.id] },
      overrideAccess: true,
    })
    await overlapWrites('subfeeds', [
      () => assignSubfeedRole(subfeed.id, appointed.id, 'editor'),
      () => removeSubfeedMember(subfeed.id, removed.id),
    ])
    const persisted = await payload.findByID({
      collection: 'subfeeds',
      id: subfeed.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(readRelationshipIds(persisted.editors)).toEqual([appointed.id])
    expect(readRelationshipIds(persisted.uploaders)).toEqual([])
    expect(readRelationshipIds(persisted.members).sort()).toEqual([admin.id, appointed.id].sort())
  })

  it('keeps two concurrent revocations and removes both locked-role flags', async () => {
    const created = await createTestUser(payload)
    const target = await payload.update({
      collection: 'users',
      id: created.id,
      data: { roles: ['user', 'editor', 'moderator'], standingLocked: true },
      overrideAccess: true,
    })
    await overlapWrites('users', [
      () => revokeAutomaticRole(target.id, 'editor', true),
      () => revokeAutomaticRole(target.id, 'moderator', true),
    ])
    const persisted = await payload.findByID({
      collection: 'users',
      id: target.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(persisted.revokedRoles?.sort()).toEqual(['editor', 'moderator'])
    expect(persisted.roles).toEqual(['user'])
    expect(persisted.isEditor).toBe(false)
    expect(persisted.isModerator).toBe(false)
  })
})
