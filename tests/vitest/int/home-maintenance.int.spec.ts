import { BasePayload, type Payload } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import HomePage from '@/app/(frontend)/page'
import SubfeedDetailsPage from '@/app/(frontend)/subfeeds/[slug]/page'
import { getAuthenticatedUser } from '@/lib/auth'
import { expireEditorialPriority } from '@/lib/community/editorialPriority'

vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}))
vi.mock('@/lib/community/editorialPriority', () => ({ expireEditorialPriority: vi.fn() }))

describe.each([
  {
    name: 'Home feed',
    render: () => HomePage({ searchParams: Promise.resolve({}) }),
  },
  {
    name: 'Subfeed page',
    render: () =>
      SubfeedDetailsPage({
        params: Promise.resolve({ slug: 'test-subfeed' }),
        searchParams: Promise.resolve({}),
      }),
  },
])('$name maintenance isolation', ({ name, render }) => {
  const payload = new BasePayload()
  const find = vi.fn()
  const error = vi.fn<Payload['logger']['error']>()
  payload.find = find
  Object.defineProperty(payload, 'logger', { value: { error } })

  beforeEach(() => {
    vi.clearAllMocks()
    find.mockImplementation(async ({ collection }) =>
      collection === 'subfeeds'
        ? { docs: [{ id: 1, slug: 'test-subfeed', name: 'Test Subfeed' }], totalDocs: 1 }
        : { docs: [], totalDocs: 0 },
    )
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ user: null, payload })
  })

  it('continues reading and rendering the feed when editorial expiry rejects', async () => {
    const failure = new Error('Expiry write failed')
    vi.mocked(expireEditorialPriority).mockRejectedValueOnce(failure)

    await expect(render()).resolves.toBeTruthy()
    expect(error).toHaveBeenCalledWith({
      err: failure,
      msg: `Failed to expire editorial priority on ${name}`,
    })
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'links' }))
  })

  it('waits for expiry to finish before selecting ranked content, bypassing the throttle', async () => {
    let finishExpiry!: (result: { processed: number }) => void
    const expiry = new Promise<{ processed: number }>((resolve) => {
      finishExpiry = resolve
    })
    vi.mocked(expireEditorialPriority).mockReturnValueOnce(expiry)

    const rendering = render()
    await vi.waitFor(() => {
      expect(expireEditorialPriority).toHaveBeenCalledWith({ payload, force: true })
    })
    expect(find).not.toHaveBeenCalled()

    finishExpiry({ processed: 1 })
    await expect(rendering).resolves.toBeTruthy()
    expect(error).not.toHaveBeenCalled()
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'links', sort: '-rankingScore' }),
    )
  })
})
