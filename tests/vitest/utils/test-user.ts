import type { Payload } from 'payload'
import type { User } from '@/payload-types' // Adjust path if needed, usually generated
import dotenv from 'dotenv'
import path from 'path'

import config from '@/payload.config'
import { createMember, createPayloadLoader } from '../../fixtures/community'

// Load test.env specifically if not already loaded, though vitest setup should handle it.
// Just to be safe and explicit about where vars come from if run in isolation.
dotenv.config({ path: path.resolve(process.cwd(), 'tests/test.env') })

/**
 * The Vitest adapter for the shared fixture module: it supplies the config
 * loader, the module owns the promise-lock.
 */
export const getTestPayload: () => Promise<Payload> = createPayloadLoader(async () => config)

let cachedUser: User | null = null
let userInitPromise: Promise<User> | null = null

const usernameFromEmail = (email: string): string => {
  const localPart = email.split('@')[0] || 'tester'
  return `${localPart}-${Math.random().toString(36).slice(2, 8)}`
}

export async function getTestUser(): Promise<User> {
  if (cachedUser) return cachedUser
  if (userInitPromise) return userInitPromise

  userInitPromise = (async () => {
    const payload = await getTestPayload()
    const email = process.env.EMAIL ?? 'admin@mail.com'
    const password = process.env.PASSWORD ?? 'test'

    const { docs: users } = await payload.find({
      collection: 'users',
      where: {
        email: {
          equals: email,
        },
      },
      overrideAccess: true,
    })

    if (users.length > 0) {
      cachedUser = users[0] as User
      return cachedUser
    }

    cachedUser = (await createMember(payload, {
      email,
      username: usernameFromEmail(email),
      password,
    })) as unknown as User

    return cachedUser
  })()

  try {
    return await userInitPromise
  } finally {
    userInitPromise = null
  }
}
