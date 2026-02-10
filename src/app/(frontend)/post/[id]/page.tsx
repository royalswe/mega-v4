export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { Card, CardContent } from '@/components/ui/card'
import { notFound } from 'next/navigation'
import { CommentForm } from '@/components/comments/CommentForm'
import { VoteButtons } from '@/components/posts/VoteButtons'
import { BookmarkButton } from '@/components/posts/BookmarkButton'
import { getDictionary } from '@/lib/dictionaries'
import { Avatar } from '@/components/users/Avatar'
import { getPostInteractions } from '@/app/(frontend)/data/getPostInteractions'
import { getAuthenticatedUser } from '@/lib/auth'
import { RichTextDisplay } from '@/components/ui/RichTextDisplay'
import { Timestamp } from '@/components/ui/Timestamp'

async function getComments(postId: number) {
  const payload = await getPayload({
    config: configPromise,
  })

  const comments = await payload.find({
    collection: 'comments',
    where: {
      post: {
        equals: postId,
      },
    },
    sort: '-createdAt',
    depth: 2,
  })

  return comments.docs
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, payload } = await getAuthenticatedUser()

  const { docs: posts } = await payload.find({
    collection: 'posts',
    where: {
      id: {
        equals: parseInt(id),
      },
    },
  })

  if (!posts.length) {
    return notFound()
  }

  const post = posts[0]

  const comments = await getComments(post.id)
  const { dict } = await getDictionary()

  // Fetch user interactions
  const { votes, bookmarks } = await getPostInteractions(user?.id || 0, [post.id])
  const userVote = votes[post.id]
  const isBookmarked = bookmarks[post.id]

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex gap-4 mb-8">
        <div className="shrink-0">
          <VoteButtons
            postId={post.id}
            votes={post.votes || 0}
            userId={user?.id}
            userVote={userVote}
          />
        </div>
        <div className="grow">
          <h1 className="text-2xl font-bold mb-2">{post.title}</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
            <span>
              {dict.common.submittedBy}{' '}
              {(typeof post.user === 'object' && post.user?.username) || 'Ghost'}
            </span>
            <Timestamp date={post.updatedAt} prefix="updated" />
          </div>
          <div className="flex gap-4 mb-6">
            <BookmarkButton
              postId={post.id}
              userId={user?.id}
              isBookmarked={isBookmarked}
              dict={dict}
            />
          </div>
          <div className="text-lg mb-6">
            <RichTextDisplay content={post.content} />
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4">{dict.common.comments}</h2>
        <CommentForm postId={post.id} userId={user?.id} dict={dict} />
        <div className="flex flex-col gap-4 mt-4">
          {comments.map((comment) => (
            <Card key={comment.id}>
              <CardContent className="pt-6">
                <div className="flex gap-4">
                  <div className="shrink-0">
                    <Avatar
                      user={typeof comment.user === 'object' ? comment.user : null}
                      className="h-10 w-10"
                    />
                  </div>
                  <div className="grow">
                    <div className="mb-2">
                      <RichTextDisplay content={comment.comment} />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>
                        {dict.common.postedBy}{' '}
                        {typeof comment.user === 'object' && comment.user?.username ? (
                          <Link href={`/user/${comment.user.username}`} className="hover:underline">
                            {comment.user.username}
                          </Link>
                        ) : (
                          <span>Ghost</span>
                        )}
                      </span>
                      <Timestamp date={comment.createdAt} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
