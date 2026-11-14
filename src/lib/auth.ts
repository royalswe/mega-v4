import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { cache } from 'react'

/**
 * Request-scoped auth lookup. Wrapped in `React.cache` so the layout, pages,
 * and every card in a feed share one `payload.auth()` execution per render —
 * without this, each `LinkCard`/`PostCard` re-runs auth (a DB round-trip) via
 * `getDictionary()`. Outside a React render scope (route handlers, scripts)
 * `cache` falls back to plain execution.
 */
export const getAuthenticatedUser = cache(async () => {
  const headersList = await headers()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: headersList })

  return { user, payload }
})
