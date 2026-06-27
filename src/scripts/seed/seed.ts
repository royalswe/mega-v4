import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { seedUsers } from './seeders/users.seed'
import { seedSubfeeds } from './seeders/subfeeds.seed'
import { seedLinks } from './seeders/links.seed'
import { seedPosts } from './seeders/posts.seed'
import { seedComments } from './seeders/comments.seed'
import { seedVotes } from './seeders/votes.seed'
import { seedBookmarks } from './seeders/bookmarks.seed'
import { seedDiscoveries } from './seeders/discoveries.seed'
import { seedReports } from './seeders/reports.seed'

async function main() {
  const payload = await getPayload({ config: configPromise })

  try {
    await seedUsers(payload)
    await seedSubfeeds(payload)
    await seedLinks(payload)
    await seedPosts(payload)
    await seedComments(payload)
    await seedVotes(payload)
    await seedBookmarks(payload)
    await seedDiscoveries(payload)
    await seedReports(payload)

    console.log('Seed pipeline complete')
    process.exit(0)
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

void main()
