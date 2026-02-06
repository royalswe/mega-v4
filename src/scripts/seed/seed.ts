import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { seedUsers } from './seeders/users.seed'
import { seedLinks } from './seeders/links.seed'

async function main() {
  const payload = await getPayload({ config: configPromise })

  try {
    await seedUsers(payload)
    await seedLinks(payload)
    process.exit(0)
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

void main()
