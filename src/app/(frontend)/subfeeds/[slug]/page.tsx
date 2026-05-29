export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getPostInteractions } from '@/app/(frontend)/data/getPostInteractions'
import { getUserInteractions } from '@/app/(frontend)/data/getInteractions'
import { LinkCard } from '@/components/links/LinkCard'
import { PostCard } from '@/components/posts/PostCard'
import { JoinSubfeedButton } from '@/components/subfeeds/JoinSubfeedButton'
import { SubfeedCreatePanel } from '@/components/subfeeds/SubfeedCreatePanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { canModerateCommunity, readRelationshipIds } from '@/lib/community/subfeeds'

export default async function SubfeedDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  const withAccess = user
    ? {
        user,
        overrideAccess: false as const,
      }
    : {
        overrideAccess: false as const,
      }

  const { docs: subfeeds } = await payload.find({
    collection: 'subfeeds',
    where: {
      slug: {
        equals: slug,
      },
    },
    limit: 1,
    depth: 1,
    ...withAccess,
  })

  if (subfeeds.length === 0) {
    return notFound()
  }

  const subfeed = subfeeds[0]

  const memberIds = readRelationshipIds(subfeed.members)
  const isMember = user ? memberIds.includes(user.id) : false
  const canCreate = user ? isMember || canModerateCommunity(user) : false

  const [{ docs: links }, { docs: posts }] = await Promise.all([
    payload.find({
      collection: 'links',
      where: {
        and: [
          {
            feed: {
              equals: 'subfeed',
            },
          },
          {
            subfeed: {
              equals: subfeed.id,
            },
          },
          {
            _status: {
              equals: 'published',
            },
          },
          {
            softDeleted: {
              not_equals: true,
            },
          },
        ],
      },
      sort: '-rankingScore',
      limit: 25,
      ...withAccess,
    }),
    payload.find({
      collection: 'posts',
      where: {
        and: [
          {
            feed: {
              equals: 'subfeed',
            },
          },
          {
            subfeed: {
              equals: subfeed.id,
            },
          },
          {
            status: {
              equals: 'published',
            },
          },
        ],
      },
      sort: '-rankingScore',
      limit: 25,
      ...withAccess,
    }),
  ])

  const linkIds = links.map((link) => link.id)
  const postIds = posts.map((post) => post.id)

  const [
    { votes: linkVotes, bookmarks: linkBookmarks },
    { votes: postVotes, bookmarks: postBookmarks },
  ] = await Promise.all([getUserInteractions(user, linkIds), getPostInteractions(user, postIds)])

  return (
    <div className="space-y-6">
      <section className="rounded-xl border p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">{subfeed.name}</h1>
            <p className="max-w-2xl text-muted-foreground">{subfeed.description}</p>
            <p className="text-sm text-muted-foreground">
              {memberIds.length} {dict.subfeeds?.membersLabel || 'members'} •{' '}
              {dict.subfeeds?.reputationLabel || 'Reputation'} {subfeed.reputation ?? 0}
            </p>
          </div>
          {user ? (
            <JoinSubfeedButton
              subfeedId={subfeed.id}
              isMember={isMember}
              labels={dict.subfeeds?.joinButton}
            />
          ) : (
            <Button asChild variant="outline">
              <Link href="/login">{dict.subfeeds?.loginToJoin || 'Log in to join'}</Link>
            </Button>
          )}
        </div>

        {subfeed.rules ? (
          <div className="mt-4 rounded-lg border bg-muted/30 p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
              {dict.subfeeds?.rulesTitle || 'Rules'}
            </h2>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{subfeed.rules}</p>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{dict.subfeeds?.topLinksTitle || 'Top Links'}</h2>
          {canCreate ? (
            <SubfeedCreatePanel
              subfeedId={subfeed.id}
              subfeedName={subfeed.name}
              mode="link"
              dict={dict}
            />
          ) : null}
        </div>
        {links.length > 0 ? (
          <div className="flex flex-col gap-4">
            {links.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                userId={user?.id}
                userVote={linkVotes[link.id]}
                isBookmarked={linkBookmarks[link.id]}
                className={link.nsfw ? 'nsfw-text' : ''}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              {dict.subfeeds?.noLinksYet || 'No links have been submitted to this subfeed yet.'}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{dict.subfeeds?.topPostsTitle || 'Top Posts'}</h2>
          {canCreate ? (
            <SubfeedCreatePanel
              subfeedId={subfeed.id}
              subfeedName={subfeed.name}
              mode="post"
              dict={dict}
            />
          ) : null}
        </div>
        {posts.length > 0 ? (
          <div className="flex flex-col gap-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                userId={user?.id}
                userVote={postVotes[post.id]}
                isBookmarked={postBookmarks[post.id]}
                className={post.nsfw ? 'nsfw-text' : ''}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              {dict.subfeeds?.noPostsYet ||
                'No posts in this subfeed yet. Be the first to start a discussion.'}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
