import React from 'react'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { VoteButtons } from '../VoteButtons'

async function getAllLinks() {
  const payload = await getPayload({
    config: configPromise,
  })

  const links = await payload.find({
    collection: 'links',
    sort: '-createdAt',
  })

  return links.docs
}

const SubmittedLinksPage = async () => {
  const links = await getAllLinks()

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">All Submitted Links</h2>
      <div className="grid gap-4">
        {links.map((link) => (
          <Card key={link.id}>
            <CardHeader>
              <CardTitle>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.title}
                </a>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p>{link.description}</p>
              <div className="flex items-center justify-between text-sm text-muted-foreground mt-4">
                <span
                  className={`capitalize ${
                    link.status === 'approved'
                      ? 'text-green-500'
                      : link.status === 'rejected'
                        ? 'text-red-500'
                        : 'text-yellow-500'
                  }`}
                >
                  {link.status}
                </span>
                <div className="flex items-center space-x-2">
                  <VoteButtons linkId={link.id} />
                  <span>{link.votes} votes</span>
                </div>
                <Link href={`/link/${link.id}`}>View Comments</Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default SubmittedLinksPage
