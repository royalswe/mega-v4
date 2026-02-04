import React from 'react'
import Link from 'next/link'
import { Card, CardTitle } from '@/components/ui/card'
import { MessageCircle } from 'lucide-react'
import { VoteButtons } from '@/components/links/VoteButtons'
import { BookmarkButton } from '@/components/links/BookmarkButton'
import { LinkIcon } from '@/components/links/LinkIcon'
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

  return (
    <Card className={`flex-row p-4`}>
      <div className="shrink-0">
        <VoteButtons linkId={link.id} votes={link.votes || 0} userId={userId} userVote={userVote} />
      </div>
      <div className="grow flex flex-col justify-center">
        <div className="flex items-center space-x-2 mb-1">
          <LinkIcon type={link.type} />
          <CardTitle className={`text-lg font-semibold leading-none ${className}`}>
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
          <Link href={`/link/${link.id}`} className="flex items-center hover:underline">
            <MessageCircle className="w-4 h-4 mr-1" />
            {link.relatedComments?.docs?.length || 0} {dict.common.comments}
          </Link>
          <BookmarkButton
            linkId={link.id}
            userId={userId}
            isBookmarked={isBookmarked}
            dict={dict}
          />
        </div>
      </div>
    </Card>
  )
}
