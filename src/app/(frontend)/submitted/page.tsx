import React from 'react'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { VoteButtons } from '../VoteButtons'
import { Bookmark, MessageCircle, Image, Video, FileText, Music, Gamepad2 } from 'lucide-react'
import { BookmarkButton } from '../BookmarkButton'

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

  const getLinkIcon = (type: string) => {
    switch (type) {
      case 'article':
        return <FileText className="w-4 h-4" />
      case 'video':
        return <Video className="w-4 h-4" />
      case 'image':
        return <Image className="w-4 h-4" />
      case 'audio':
        return <Music className="w-4 h-4" />
      case 'game':
        return <Gamepad2 className="w-4 h-4" />
      default:
        return <FileText className="w-4 h-4" />
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">All Submitted Links</h2>
      <div className="grid gap-4">
        {links.map((link) => (
          <Card key={link.id} className="flex-row p-4">
            <div className="shrink-0">
              <VoteButtons linkId={link.id} votes={link.votes} />
            </div>
            <div className="grow flex flex-col justify-center">
              <div className="flex items-center space-x-2 mb-1">
                {getLinkIcon(link.type)}
                <CardTitle className="text-lg font-semibold leading-none">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {link.title}
                  </a>
                </CardTitle>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Submitted by {/* @ts-expect-error */} {link.user.name || 'Anonymous'}
              </p>
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                <span
                  className={`capitalize ${
                    link.status === 'approved'
                      ? 'text-green-500'
                      : link.status === 'rejected'
                        ? 'text-red-500'
                        : 'text-yellow-500'
                  } mr-2`}
                >
                  {link.status}
                </span>
                <Link href={`/link/${link.id}`} className="flex items-center hover:underline">
                  <MessageCircle className="w-4 h-4 mr-1" /> {/* @ts-expect-error */}{' '}
                  {link.comments ? link.comments.length : 0} Comments
                </Link>
                <BookmarkButton linkId={link.id} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default SubmittedLinksPage
