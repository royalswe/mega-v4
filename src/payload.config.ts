import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { migrations } from './migrations'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Links } from './collections/Links'
import { Comments } from './collections/Comments'
import { Votes } from './collections/Votes'
import { Bookmarks } from './collections/Bookmarks'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const autoLogin =
  process.env.NODE_ENV === 'development' && process.env.LOCAL_PAYLOAD_ADMIN_EMAIL
    ? {
        email: process.env.LOCAL_PAYLOAD_ADMIN_EMAIL,
        password: process.env.LOCAL_PAYLOAD_ADMIN_PASSWORD,
      }
    : false

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    autoLogin,
  },
  jobs: {
    autoRun: [
      {
        cron: '*/5 * * * *', // Run every minute
      },
    ],
  },
  collections: [Users, Media, Links, Comments, Votes, Bookmarks],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    prodMigrations: migrations,
  }),
  sharp,
  plugins: [],
})
