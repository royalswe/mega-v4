import Link from 'next/link'
import { Card, CardTitle } from '@/components/ui/card'
import { MessageCircle, Eye } from 'lucide-react'
import { VoteButtons } from '@/components/links/VoteButtons'
import { BookmarkButton } from '@/components/links/BookmarkButton'
import { LinkIcon } from '@/components/links/LinkIcon'
import { TrackedLink } from '@/components/links/TrackedLink'
import { SubfeedAvatar } from '@/components/subfeeds/SubfeedAvatar'
import { getDictionary } from '@/lib/dictionaries'

import type { Link as LinkType } from '@/payload-types'
// We need a partial type since we might not have the full depth or specific relations populated exactly as the generated type expects in all contexts,
// but for now let's try to use the generated type or a compatible interface.
// If payload-types.ts is not perfectly matching what we get from `find`, we might need to adjust.
// For now, let's assume `link` passed here matches the structure we need.

export async function LinkCard({
  link,
  userId,
  userVote,
  isBookmarked,
  className,
}: {
  link: LinkType
  userId?: string | number | null
  userVote?: 'up' | 'down'
  isBookmarked?: boolean
  className?: string
}) {
  const { dict } = await getDictionary()
  const subfeed = typeof link.subfeed === 'object' && link.subfeed ? link.subfeed : null

  return (
    <Card className="flex flex-row items-start gap-2 px-3 py-3 sm:px-4 sm:py-2">
      <div className="shrink-0 self-start">
        <VoteButtons linkId={link.id} votes={link.votes || 0} userId={userId} userVote={userVote} />
      </div>
      <div className="grow min-w-0 self-center flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <LinkIcon type={link.type} className="h-10 w-10 shrink-0" />
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className={`text-base font-semibold leading-tight sm:text-lg ${className}`}>
              <TrackedLink
                url={link.url}
                title={link.title}
                linkId={link.id}
                className="wrap-break-word hover:underline"
              />
            </CardTitle>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {link.feed === 'subfeed' ? (
            subfeed?.slug ? (
              <Link
                href={`/subfeeds/${subfeed.slug}`}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs font-medium hover:underline"
              >
                <SubfeedAvatar
                  subfeed={subfeed}
                  className="h-4 w-4 rounded-full object-cover"
                  fallbackClassName="inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[10px] font-semibold"
                />
                <span className="max-w-48 truncate">{subfeed.name}</span>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs font-medium">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                  S
                </span>
                {dict.menu?.subfeeds || 'SubFeeds'}
              </span>
            )
          ) : null}
          <Link href={`/link/${link.id}`} className="flex items-center hover:underline">
            <MessageCircle className="mr-1 h-4 w-4" />
            {link.relatedComments?.docs?.length || 0} {dict.common.comments}
          </Link>
          <div className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            <span>{link.clickCount || 0}</span>
          </div>
          <BookmarkButton
            linkId={link.id}
            userId={userId}
            isBookmarked={isBookmarked}
            dict={dict}
          />
          <p className="wrap-break-word">
            {dict.common.submittedBy}{' '}
            <b>{(typeof link.user === 'object' && link.user?.username) || 'Ghost'}</b>
          </p>
        </div>
      </div>
    </Card>
  )
}
