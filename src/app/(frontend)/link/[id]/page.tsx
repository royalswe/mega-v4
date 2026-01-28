import React from 'react'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { notFound } from 'next/navigation'
import { CommentForm } from './CommentForm'

async function getLink(id: number) {
  const payload = await getPayload({
    config: configPromise,
  })

  const link = await payload.findByID({
    collection: 'links',
    id,
  })

  return link
}

async function getComments(linkId: number) {
  const payload = await getPayload({
    config: configPromise,
  })

  const comments = await payload.find({
    collection: 'comments',
    where: {
      link: {
        equals: linkId,
      },
    },
    sort: '-createdAt',
  })

  return comments.docs
}

const LinkPage = async ({ params }: { params: { id: number } }) => {
  console.log('params.id:', params.id)

  const link = await getLink(params.id)

  if (!link) {
    return notFound()
  }

  const comments = await getComments(params.id)

  return (
    <div>
      <Card>
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
            <span>{link.votes} votes</span>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Comments</h2>
        <CommentForm linkId={params.id} />
        <div className="grid gap-4 mt-4">
          {comments.map((comment) => (
            <Card key={comment.id}>
              <CardContent>
                <p className="py-4">{comment.comment}</p>
                <span className="text-sm text-muted-foreground">
                  {/* @ts-expect-error */}
                  Posted by {comment.user.name || 'Anonymous'}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

export default LinkPage
