export const dynamic = 'force-dynamic' // This stops the build-time DB check

import React from 'react'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { Card, CardContent } from '@/components/ui/card'
import { notFound } from 'next/navigation'
import { CommentForm } from '@/components/comments/CommentForm'
import { VoteButtons } from '@/components/links/VoteButtons'
import { headers } from 'next/headers'
import { LinkIcon } from '@/components/links/LinkIcon'
import { BookmarkButton } from '@/components/links/BookmarkButton'

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

import { getUserInteractions } from '@/app/(frontend)/data/getInteractions'

export default async function LinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headersList = await headers()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: headersList })

  const { docs: links } = await payload.find({
    collection: 'links',
    where: {
      id: {
        equals: parseInt(id),
      },
    },
  })

  if (!links.length) {
    return notFound()
  }

  const link = links[0]

  const comments = await getComments(link.id)

  // Fetch user interactions
  const { votes, bookmarks } = await getUserInteractions(user?.id || 0, [link.id])
  const userVote = votes[link.id]
  const isBookmarked = bookmarks[link.id]

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex gap-4 mb-8">
        <div className="shrink-0">
          <VoteButtons
            linkId={link.id}
            votes={link.votes || 0}
            userId={user?.id}
            userVote={userVote}
          />
        </div>
        <div className="grow">
          <div className="flex items-center gap-2 mb-2">
            <LinkIcon type={link.type} />
            <h1 className="text-2xl font-bold hover:underline">
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                {link.title}
              </a>
            </h1>
          </div>
          <p className="text-muted-foreground mb-4">
            Submitted by {(typeof link.user === 'object' && link.user?.username) || 'Ghost'}
          </p>
          <div className="flex gap-4 mb-6">
            <BookmarkButton
              linkId={link.id}
              userId={user?.id}
              isBookmarked={isBookmarked}
            />
          </div>
          <p className="whitespace-pre-wrap">{link.description}</p>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4">Comments</h2>
        <CommentForm linkId={link.id} userId={user?.id} />
        <div className="grid gap-4 mt-4">
          {comments.map((comment) => (
            <Card key={comment.id}>
              <CardContent>
                <p className="py-4">{comment.comment}</p>
                <span className="text-sm text-muted-foreground">
                  Posted by{' '}
                  {(typeof comment.user === 'object' && comment.user?.username) || 'Ghost'}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
