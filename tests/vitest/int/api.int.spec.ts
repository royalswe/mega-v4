import { getPayload, Payload } from 'payload'
import { getTestPayload } from '../utils/test-user'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

let payload: Payload

describe('API', () => {
  beforeAll(async () => {
    // Ensure payload is initialized via helper
    await getTestPayload()
  })

  it('fetches users', async () => {
    const payload = await getTestPayload()
    const users = await payload.find({
      collection: 'users',
    })
    expect(users).toBeDefined()
    expect(users.docs.length).toBeGreaterThan(0)
  })
})
