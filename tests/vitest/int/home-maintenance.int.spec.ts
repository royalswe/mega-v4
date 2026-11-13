import { BasePayload, type Payload } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import HomePage from '@/app/(frontend)/page'
import { getAuthenticatedUser } from '@/lib/auth'
import { expireEditorialPriority } from '@/lib/community/editorialPriority'

vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}))
vi.mock('@/lib/community/editorialPriority', () => ({ expireEditorialPriority: vi.fn() }))

describe('Home maintenance isolation', () => {
  const payload = new BasePayload()
  const find = vi.fn()
  const error = vi.fn<Payload['logger']['error']>()
  payload.find = find
  Object.defineProperty(payload, 'logger', { value: { error } })

  beforeEach(() => {
    vi.clearAllMocks()
    find.mockResolvedValue({ docs: [], totalDocs: 0 })
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ user: null, payload })
  })

  it('continues reading and rendering the feed when editorial expiry rejects', async () => {
    const failure = new Error('Expiry write failed')
    vi.mocked(expireEditorialPriority).mockRejectedValueOnce(failure)

    await expect(HomePage({ searchParams: Promise.resolve({}) })).resolves.toBeTruthy()
    expect(error).toHaveBeenCalledWith({
      err: failure,
      msg: 'Failed to expire editorial priority on Home feed',
    })
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'links' }))
  })

  it('still expires editorial priority before reading the feed on success', async () => {
    vi.mocked(expireEditorialPriority).mockResolvedValueOnce({ processed: 1 })

    await expect(HomePage({ searchParams: Promise.resolve({}) })).resolves.toBeTruthy()
    expect(expireEditorialPriority).toHaveBeenCalledWith({ payload })
    expect(error).not.toHaveBeenCalled()
    expect(vi.mocked(expireEditorialPriority).mock.invocationCallOrder[0]).toBeLessThan(
      find.mock.invocationCallOrder[0],
    )
  })
})
