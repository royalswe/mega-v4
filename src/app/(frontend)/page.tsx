export const dynamic = 'force-dynamic' // This stops the build-time DB check

import React from 'react'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { LinkCard } from '@/components/links/LinkCard'

async function getApprovedLinks() {
  const payload = await getPayload({
    config: configPromise,
  })

  const links = await payload.find({
    collection: 'links',
    where: {
      status: {
        equals: 'approved',
      },
    },
    sort: '-createdAt',
  })

  return links.docs
}

const HomePage = async () => {
  const links = await getApprovedLinks()

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Approved Links</h2>
      <div className="grid gap-4">
        {links.map((link) => (
          <LinkCard key={link.id} link={link} />
        ))}
      </div>
    </div>
  )
}

export default HomePage
