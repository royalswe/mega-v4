export const dynamic = 'force-dynamic' // This stops the build-time DB check

import type { Where } from 'payload'
import { Card, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { VoteButtons } from '@/components/links/VoteButtons'
import { MessageCircle, Image, Video, FileText, Music, Gamepad2 } from 'lucide-react'
import { BookmarkButton } from '@/components/links/BookmarkButton'
import { Button } from '@/components/ui/button'
import { redirect } from 'next/navigation'
import { TrackedLink } from '@/components/links/TrackedLink'

import { getUserInteractions } from '@/app/(frontend)/data/getInteractions'
import {
  deleteSubmittedLink,
  enableSubmittedLinkInMainFeed,
  toggleSubmittedLinkStatus,
} from '@/app/actions/links'
import { getAuthenticatedUser } from '@/lib/auth'
import { canManageSubmittedLinks } from '@/lib/community/subfeeds'
import { getDictionary } from '@/lib/dictionaries'

import type { Payload } from 'payload'
import type { User } from '@/payload-types'

async function getAllLinks(payload: Payload, user: User | null, showNSFW: boolean) {
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()

  const recentVisibilityFilter: Where = showNSFW
    ? {
        createdAt: {
          greater_than_equal: twelveHoursAgo,
        },
      }
    : {
        and: [
          {
            createdAt: {
              greater_than_equal: twelveHoursAgo,
            },
          },
          {
            nsfw: {
              not_equals: true,
            },
          },
        ],
      }

  const andFilters: Where[] = [
    {
      softDeleted: {
        not_equals: true,
      },
    },
    {
      or: [
        {
          _status: {
            equals: 'draft',
          },
        },
        recentVisibilityFilter,
      ],
    },
  ]

  const where: Where = {
    and: andFilters,
  }

  const withAccess = user
    ? {
        user,
        overrideAccess: false as const,
      }
    : {
        overrideAccess: false as const,
      }

  const links = await payload.find({
    collection: 'links',
    where,
    sort: '-rankingScore',
    draft: true,
    pagination: false,
    ...withAccess,
  })

  return links.docs
}

const SubmittedLinksPage = async () => {
  const { user, payload } = await getAuthenticatedUser()

  if (!user || !canManageSubmittedLinks(user)) {
    redirect('/')
  }

  const showNSFW = user?.settings?.nsfw === true
  const { dict } = await getDictionary()
  const links = await getAllLinks(payload, user, showNSFW)

  // Fetch user interactions
  const linkIds = links.map((link) => link.id)
  const { votes, bookmarks } = await getUserInteractions(user, linkIds)

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
                  <TrackedLink
                    url={link.url}
                    title={link.title}
                    linkId={link.id}
                    type={link.type}
                    className="hover:underline"
                  />
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
                <div className="ml-auto flex items-center gap-2">
                  {link.feed === 'subfeed' ? (
                    <form action={enableSubmittedLinkInMainFeed.bind(null, link.id)}>
                      <Button
                        type="submit"
                        size="xs"
                        variant="secondary"
                        disabled={link.featured === true}
                      >
                        {link.featured === true
                          ? dict.pages.inMainFeed || 'In main feed'
                          : dict.pages.enableInMainFeed || 'Enable in main feed'}
                      </Button>
                    </form>
                  ) : null}
                  <form
                    action={toggleSubmittedLinkStatus.bind(
                      null,
                      link.id,
                      link._status === 'published' ? 'draft' : 'published',
                    )}
                  >
                    <Button type="submit" size="xs" variant="outline">
                      {link._status === 'published' ? 'Set draft' : 'Publish'}
                    </Button>
                  </form>
                  <form action={deleteSubmittedLink.bind(null, link.id)}>
                    <Button type="submit" size="xs" variant="destructive">
                      Soft delete
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default SubmittedLinksPage
