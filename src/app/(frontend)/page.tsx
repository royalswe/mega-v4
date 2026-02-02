export const dynamic = 'force-dynamic' // This stops the build-time DB check

import React from 'react'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { LinkCard } from '@/components/links/LinkCard'
import { headers } from 'next/headers'

export default async function HomePage() {
  const headersList = await headers()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: headersList })

  const { docs: links } = await payload.find({
    collection: 'links',
    where: {
      status: {
        equals: 'approved',
      },
    },
    sort: '-createdAt',
  })

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold mb-4">Approved Links</h2>
      <div className="grid gap-4">
        {links.map((link) => (
          <LinkCard key={link.id} link={link} userId={user?.id} />
        ))}
      </div>
    </div>
  )
}
