import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import type { User } from '@/payload-types' // Adjust path if needed, usually generated
import dotenv from 'dotenv'
import path from 'path'

// Load test.env specifically if not already loaded, though vitest setup should handle it.
// Just to be safe and explicit about where vars come from if run in isolation.
dotenv.config({ path: path.resolve(process.cwd(), 'tests/test.env') })

let cachedPayload: Payload | null = null
let cachedUser: User | null = null

export async function getTestPayload(): Promise<Payload> {
  if (cachedPayload) return cachedPayload
  const payloadConfig = await config
  cachedPayload = await getPayload({ config: payloadConfig })
  return cachedPayload
}

export async function getTestUser(): Promise<User> {
  if (cachedUser) return cachedUser

  const payload = await getTestPayload()
  const email = process.env.EMAIL ?? 'admin@mail.com'
  const password = process.env.PASSWORD ?? 'test'

  // Try to find existing user
  const { docs: users } = await payload.find({
    collection: 'users',
    where: {
      email: {
        equals: email,
      },
    },
  })

  if (users.length > 0) {
    cachedUser = users[0] as User
    return cachedUser
  }

  // Create new user if not found
  cachedUser = (await payload.create({
    collection: 'users',
    data: {
      email,
      password,
      // Add other required fields here if necessary
    },
    overrideAccess: true, // Ensure we can create admin without existing auth
  } as any)) as User

  return cachedUser
}
