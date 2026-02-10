import Link from 'next/link'
import { Card, CardTitle } from '@/components/ui/card'
import { MessageCircle } from 'lucide-react'
import { VoteButtons } from '@/components/posts/VoteButtons'
import { BookmarkButton } from '@/components/posts/BookmarkButton'
import { getDictionary } from '@/lib/dictionaries'
import { RichTextDisplay } from '@/components/ui/RichTextDisplay'
import { Timestamp } from '@/components/ui/Timestamp'

import type { Post } from '@/payload-types'

export async function PostCard({
  post,
  userId,
  userVote,
  isBookmarked,
  className,
}: {
  post: Post
  userId?: string | number | null
  userVote?: 'up' | 'down'
  isBookmarked?: boolean
  className?: string
}) {
  const { dict } = await getDictionary()

  return (
    <Card className={`flex-row items-start px-4 py-3 gap-3`}>
      <VoteButtons postId={post.id} votes={post.votes || 0} userId={userId} userVote={userVote} />
      <div className="grow flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle className={`text-lg font-semibold leading-tight ${className}`}>
            <Link href={`/post/${post.id}`} className="hover:underline">
              {post.title}
            </Link>
          </CardTitle>
          <div className="text-sm text-muted-foreground line-clamp-3">
            <RichTextDisplay content={post.content} />
          </div>
        </div>
        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
          <Link href={`/post/${post.id}`} className="flex items-center hover:underline">
            <MessageCircle className="w-4 h-4 mr-1" />
            {post.relatedComments?.docs?.length || 0} {dict.common.comments}
          </Link>
          <BookmarkButton
            postId={post.id}
            userId={userId}
            isBookmarked={isBookmarked}
            dict={dict}
          />
          <p>
            {dict.common.submittedBy}{' '}
            <b>{(typeof post.user === 'object' && post.user?.username) || 'Ghost'}</b>
          </p>
          {post.updatedAt &&
            new Date(post.updatedAt).getTime() > new Date(post.createdAt).getTime() + 60000 && (
              <Timestamp date={post.updatedAt} prefix="updated" />
            )}
        </div>
      </div>
    </Card>
  )
}
