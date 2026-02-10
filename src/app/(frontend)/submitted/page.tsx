export const dynamic = 'force-dynamic' // This stops the build-time DB check

import { getPayload, type Where } from 'payload'
import configPromise from '@payload-config'
import { Card, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { VoteButtons } from '@/components/links/VoteButtons'
import { MessageCircle, Image, Video, FileText, Music, Gamepad2 } from 'lucide-react'
import { BookmarkButton } from '@/components/links/BookmarkButton'

import { getUserInteractions } from '@/app/(frontend)/data/getInteractions'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'

async function getAllLinks(showNSFW: boolean) {
  const where: Where = {}

  if (!showNSFW) {
    where.nsfw = {
      not_equals: true,
    }
  }

  const payload = await getPayload({
    config: configPromise,
  })

  const links = await payload.find({
    collection: 'links',
    where,
    sort: '-createdAt',
  })

  return links.docs
}

const SubmittedLinksPage = async () => {
  const { user } = await getAuthenticatedUser()
  const showNSFW = user?.settings?.nsfw === true
  const { dict } = await getDictionary()
  const links = await getAllLinks(showNSFW)

  // Fetch user interactions
  const linkIds = links.map((link) => link.id)
  const { votes, bookmarks } = await getUserInteractions(user?.id || '', linkIds)

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
      <h2 className="text-xl font-semibold mb-4">{dict.pages.submittedTitle}</h2>
      <div className="flex flex-col gap-4">
        {links.map((link) => (
          <Card key={link.id} className="flex-row px-4 py-2 ">
            <div className="shrink-0">
              <VoteButtons
                linkId={link.id}
                votes={link.votes || 0}
                userId={user?.id}
                userVote={votes[link.id]}
              />
            </div>
            <div className="grow flex flex-col justify-center">
              <div className="flex items-center space-x-2 mb-1">
                {getLinkIcon(link.type)}
                <CardTitle
                  className={`text-lg font-semibold leading-none ${link.nsfw ? 'nsfw-text' : ''}`}
                >
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
                {dict.common.submittedBy}{' '}
                {(typeof link.user === 'object' && link.user?.username) || 'Ghost'}
              </p>
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                <span
                  className={`capitalize ${
                    link._status === 'published' ? 'text-green-500' : 'text-yellow-500'
                  } mr-2`}
                >
                  {dict.status[link._status ?? 'unknown'] ?? dict.status['unknown']}
                </span>
                <Link href={`/link/${link.id}`} className="flex items-center hover:underline">
                  <MessageCircle className="w-4 h-4 mr-1" />
                  {link.relatedComments?.docs?.length || 0} {dict.common.comments}
                </Link>
                <BookmarkButton
                  linkId={link.id}
                  userId={user?.id}
                  isBookmarked={bookmarks[link.id]}
                  dict={dict}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default SubmittedLinksPage
