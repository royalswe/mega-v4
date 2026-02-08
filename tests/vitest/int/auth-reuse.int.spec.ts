import { describe, it, expect } from 'vitest'
import { getTestUser } from '../utils/test-user'

describe('Auth Reuse', () => {
  it('reuses the authenticated user', async () => {
    const user = await getTestUser()
    expect(user).toBeDefined()
    expect(user.email).toBe(process.env.EMAIL ?? 'admin@mail.com')
  })

  it('returns the same user instance on subsequent calls', async () => {
    const user1 = await getTestUser()
    const user2 = await getTestUser()
    expect(user1.id).toBe(user2.id)
  })
})
