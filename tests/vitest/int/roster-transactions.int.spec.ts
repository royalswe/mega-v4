import { JWTAuthentication, jwtSign } from 'payload'
import type { CollectionBeforeChangeHook, Payload } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { assignSubfeedRole, removeSubfeedMember, removeSubfeedRole } from '@/app/actions/subfeeds'
import { revokeAutomaticRole } from '@/app/actions/users'
import { SubFeeds } from '@/collections/SubFeeds'
import { Users } from '@/collections/Users'
import { getAuthenticatedUser } from '@/lib/auth'
import { withSerializableTransaction } from '@/lib/withSerializableTransaction'

vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/community/trustDynamics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/community/trustDynamics')>()
  return { ...actual, loadTrustDynamics: vi.fn().mockResolvedValue(actual.BASE_TRUST_DYNAMICS) }
})

type Doc = Record<string, unknown>

// Model two database snapshots and reject a stale commit, not a process lock.
const transactionalPayload = (initial: Doc) => {
  let doc = structuredClone(initial)
  let revision = 0
  type Snapshot = { revision: number; doc: Doc }
  const sessions: Record<string, { db: Snapshot }> = {}
  const snapshot = (req: { transactionID: string }) => {
    const tx = sessions[req.transactionID]?.db
    if (!tx) throw new Error('Missing transaction scope')
    return tx
  }
  const db = {
    sessions,
    drizzle: {
      transaction: vi.fn(async (operation: (tx: Snapshot) => Promise<unknown>) => {
        const tx = { revision, doc: structuredClone(doc) }
        const result = await operation(tx)
        if (tx.revision !== revision) {
          throw new Error('Commit conflict', { cause: { code: '40001' } })
        }
        doc = tx.doc
        revision++
        return result
      }),
    },
  }
  const payload = {
    db,
    findByID: vi.fn(async ({ req }) => structuredClone(snapshot(req).doc)),
    update: vi.fn(async ({ req, data }) => {
      const tx = snapshot(req)
      tx.doc = { ...tx.doc, ...structuredClone(data) }
      return structuredClone(tx.doc)
    }),
  } as unknown as Payload
  return { payload, db, read: () => doc }
}

const actor = { id: 1, roles: ['admin', 'user'], collection: 'users' } as const
const authenticate = (payload: Payload) => {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    user: { ...actor, roles: [...actor.roles] } as Awaited<
      ReturnType<typeof getAuthenticatedUser>
    >['user'],
    payload,
  })
}
const runHook = (hook: CollectionBeforeChangeHook, args: Record<string, unknown>) =>
  hook(args as unknown as Parameters<CollectionBeforeChangeHook>[0])

beforeEach(() => vi.clearAllMocks())

describe('Serializable roster actions (no database)', () => {
  const initial = {
    id: 10,
    slug: 'roster',
    owner: 1,
    moderators: [1, 2, 3],
    editors: [2],
    uploaders: [2, 3],
    members: [1, 2, 3],
  }

  it('preserves an assignment overlapping a revocation', async () => {
    const { payload, db, read } = transactionalPayload(initial)
    authenticate(payload)
    await Promise.all([assignSubfeedRole(10, 4, 'editor'), removeSubfeedRole(10, 2, 'editor')])
    expect(read().editors).toEqual([4])
    expect(read().members).toEqual([1, 2, 3, 4])
    expect(db.drizzle.transaction).toHaveBeenCalledTimes(3)
    expect(db.drizzle.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'serializable',
    })
    expect(db.sessions).toEqual({})
  })

  it('preserves two overlapping member removals across every roster', async () => {
    const { payload, read } = transactionalPayload(initial)
    authenticate(payload)
    await Promise.all([removeSubfeedMember(10, 2), removeSubfeedMember(10, 3)])
    expect(read()).toMatchObject({
      members: [1],
      moderators: [1],
      editors: [],
      uploaders: [],
    })
  })

  it('preserves an assignment overlapping removal of another member', async () => {
    const { payload, read } = transactionalPayload(initial)
    authenticate(payload)
    await Promise.all([assignSubfeedRole(10, 4, 'uploader'), removeSubfeedMember(10, 2)])
    expect(read()).toMatchObject({ members: [1, 3, 4], uploaders: [3, 4] })
  })

  it('preserves concurrent automatic-role revocations', async () => {
    const { payload, read } = transactionalPayload({ id: 2, revokedRoles: [] })
    authenticate(payload)
    await Promise.all([
      revokeAutomaticRole(2, 'editor', true),
      revokeAutomaticRole(2, 'moderator', true),
    ])
    expect(read().revokedRoles).toEqual(['editor', 'moderator'])
  })

  it('does not retry or hide authorization failures', async () => {
    const { payload, db } = transactionalPayload(initial)
    const error = new Error('Forbidden')
    await expect(
      withSerializableTransaction(payload, async () => {
        throw error
      }),
    ).rejects.toBe(error)
    expect(db.drizzle.transaction).toHaveBeenCalledOnce()
    expect(db.sessions).toEqual({})
  })

  it('bounds deadlock retries and propagates the final database failure', async () => {
    const { payload, db } = transactionalPayload(initial)
    const error = Object.assign(new Error('Deadlock'), { code: '40P01' })
    await expect(
      withSerializableTransaction(payload, async () => {
        throw error
      }),
    ).rejects.toBe(error)
    expect(db.drizzle.transaction).toHaveBeenCalledTimes(5)
    expect(db.sessions).toEqual({})
  })

  it('fails closed without a PostgreSQL transaction adapter', async () => {
    const { payload } = transactionalPayload(initial)
    Object.assign(payload.db, { drizzle: undefined })
    const operation = vi.fn()
    await expect(withSerializableTransaction(payload, operation)).rejects.toThrow(
      'requires PostgreSQL database transactions',
    )
    expect(operation).not.toHaveBeenCalled()
  })
})

describe('Roster and standing hooks (no database)', () => {
  const subfeedHook = SubFeeds.hooks!.beforeChange![0]
  const originalDoc = { owner: 1, moderators: [1, 2], members: [1, 2] }

  it('includes owner and creator once while preserving supplied roster members', async () => {
    const result = await runHook(subfeedHook, {
      operation: 'create',
      data: { owner: 2, moderators: [3, 2, 2], members: [4, 1, 1] },
      req: { user: actor },
    })
    expect(result).toMatchObject({ owner: 2, moderators: [3, 2, 1], members: [4, 1, 2] })
  })

  it('guards owner membership on a partial member-only update', async () => {
    await expect(async () =>
      runHook(subfeedHook, {
        operation: 'update',
        originalDoc,
        data: { members: [2] },
        req: { user: { id: 2, roles: ['user'] } },
      }),
    ).rejects.toThrow('owner')
    expect(
      await runHook(subfeedHook, {
        operation: 'update',
        originalDoc,
        data: { members: [1, 2, 3] },
        req: { user: { id: 2, roles: ['user'] } },
      }),
    ).toMatchObject({ members: [1, 2, 3] })
  })

  it('removes explicitly revoked roles and updates flags even with standing locked', async () => {
    const result = await runHook(Users.hooks!.beforeChange![0], {
      operation: 'update',
      originalDoc: { roles: ['user', 'editor', 'moderator', 'uploader'], standingLocked: true },
      data: { revokedRoles: ['editor', 'moderator'] },
      req: { context: {}, user: actor, payload: { logger: { warn: vi.fn() } } },
    })
    expect(result).toMatchObject({
      roles: ['user', 'uploader'],
      isEditor: false,
      isModerator: false,
      isUploader: true,
    })
  })
})

describe('JWT role revocation (no database)', () => {
  it('uses the current profile rather than moderator claims in an existing JWT', async () => {
    const secret = 'jwt-role-revocation-test-secret'
    const { token } = await jwtSign({
      fieldsToSign: { id: 2, collection: 'users', roles: ['moderator', 'user'] },
      secret,
      tokenExpiration: 60,
    })
    const payload = {
      config: { cookiePrefix: 'payload', admin: {}, auth: { jwtOrder: ['JWT'] } },
      encryptionKeyring: { all: [{ legacyKey: secret }] },
      collections: { users: { config: { slug: 'users', auth: {} } } },
      findByID: vi.fn().mockResolvedValue({ id: 2, roles: ['user'], revokedRoles: ['moderator'] }),
    } as unknown as Payload
    const { user } = await JWTAuthentication({
      headers: new Headers({ Authorization: `JWT ${token}` }),
      payload,
    })
    expect(user?.roles).toEqual(['user'])
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 2,
        collection: 'users',
        overrideAccess: true,
      }),
    )
  })
})
