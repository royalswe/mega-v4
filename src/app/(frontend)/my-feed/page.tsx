export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'

import { LinkCard } from '@/components/links/LinkCard'
import { PostCard } from '@/components/posts/PostCard'
import { getUserInteractions } from '@/app/(frontend)/data/getInteractions'
import { getPostInteractions } from '@/app/(frontend)/data/getPostInteractions'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { buildPublicFeedVisibilityWhere } from '@/lib/community/visibility'
import {
  hydrateFeedCardRelations,
  parseContentFilter,
  type SubfeedContentFilter,
} from '@/lib/community/feedAssembly'
import { buildTrustProgression } from '@/lib/community/reputation'
import { ServerIcon, MESSAGE_CIRCLE, EXTERNAL_LINK } from '@/components/ui/ServerIcon'

import type { Link as LinkDoc, Post as PostDoc } from '@/payload-types'

type FeedItem = {
  key: string
  kind: 'link' | 'post'
  id: number
  createdAt: number
  link?: LinkDoc
  post?: PostDoc
}

const readNum = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const LINK_SELECT = {
  id: true,
  votes: true,
  url: true,
  title: true,
  type: true,
  description: true,
  feed: true,
  subfeed: true,
  user: true,
  clickCount: true,
  commentsCount: true,
  createdAt: true,
  updatedAt: true,
  nsfw: true,
  score: true,
  upvotes: true,
  rankingScore: true,
  featured: true,
  discoveryBoosted: true,
} as const

const POST_SELECT = {
  id: true,
  votes: true,
  title: true,
  content: true,
  type: true,
  feed: true,
  subfeed: true,
  user: true,
  commentsCount: true,
  createdAt: true,
  updatedAt: true,
  nsfw: true,
  score: true,
  upvotes: true,
  rankingScore: true,
  featured: true,
  discoveryBoosted: true,
} as const

export default async function MyFeedPage({
  searchParams,
}: {
  searchParams?: Promise<{ type?: string }>
}) {
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  if (!user) {
    redirect('/login')
  }

  const resolvedSearchParams = (await searchParams) ?? {}
  const contentFilter = parseContentFilter(resolvedSearchParams.type)
  const copy = dict.pages.myFeed
  const withAccess = { user, overrideAccess: false as const }

  const [linksRes, postsRes] = await Promise.all([
    payload.find({
      collection: 'links',
      where: {
        and: [
          ...buildPublicFeedVisibilityWhere({ collection: 'links', viewer: user }),
          { user: { equals: user.id } },
          { feed: { equals: 'user' } },
        ],
      },
      sort: '-createdAt',
      limit: 50,
      depth: 0,
      select: LINK_SELECT,
      ...withAccess,
    }),
    payload.find({
      collection: 'posts',
      where: {
        and: [
          ...buildPublicFeedVisibilityWhere({ collection: 'posts', viewer: user }),
          { user: { equals: user.id } },
          { feed: { equals: 'user' } },
        ],
      },
      sort: '-createdAt',
      limit: 50,
      depth: 0,
      select: POST_SELECT,
      ...withAccess,
    }),
  ])

  const [links, posts] = await Promise.all([
    hydrateFeedCardRelations({ payload, docs: linksRes.docs }),
    hydrateFeedCardRelations({
      payload,
      docs: postsRes.docs,
      subfeedDepth: 0,
      subfeedSelect: { name: true, slug: true },
    }),
  ])

  const [{ votes: linkVotes, bookmarks: linkBookmarks }, postInteractions] = await Promise.all([
    getUserInteractions(
      user,
      links.map((link) => link.id),
    ),
    getPostInteractions(
      user,
      posts.map((post) => post.id),
    ),
  ])

  const items: FeedItem[] = [
    ...links.map((link) => ({
      key: `link-${link.id}`,
      kind: 'link' as const,
      id: link.id,
      createdAt: Date.parse(link.createdAt),
      link: link as LinkDoc,
    })),
    ...posts.map((post) => ({
      key: `post-${post.id}`,
      kind: 'post' as const,
      id: post.id,
      createdAt: Date.parse(post.createdAt),
      post: post as PostDoc,
    })),
  ].sort(
    (a, b) =>
      (Number.isNaN(b.createdAt) ? 0 : b.createdAt) - (Number.isNaN(a.createdAt) ? 0 : a.createdAt),
  )

  const visibleItems =
    contentFilter === 'links'
      ? items.filter((item) => item.kind === 'link')
      : contentFilter === 'posts'
        ? items.filter((item) => item.kind === 'post')
        : items

  const trustProgression = buildTrustProgression(readNum(user.totalMemberValue), user.trustLevel)

  const buildTypeHref = (nextType: SubfeedContentFilter) =>
    nextType === 'all' ? '/my-feed' : `/my-feed?type=${nextType}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="text-muted-foreground max-w-2xl">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1 text-xs">
            {(
              [
                ['all', dict.common.contentFilter.all],
                ['links', dict.common.contentFilter.links],
                ['posts', dict.common.contentFilter.posts],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={value}
                href={buildTypeHref(value)}
                className={`rounded px-2 py-1 ${contentFilter === value ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {label}
              </Link>
            ))}
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium">
            Trust: {trustProgression.current.label}
            {trustProgression.next ? (
              <span className="text-muted-foreground">→ {trustProgression.next.label}</span>
            ) : null}
          </span>
          <Link
            href="/new-link"
            className="inline-flex items-center gap-1 rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600"
          >
            <ServerIcon icon={EXTERNAL_LINK} className="size-3.5" />
            {dict.pages.contribute.shareLinkAction}
          </Link>
          <Link
            href="/new-post"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            <ServerIcon icon={MESSAGE_CIRCLE} className="size-3.5" />
            {dict.pages.contribute.startDiscussionAction}
          </Link>
        </div>
      </div>

      {visibleItems.length > 0 ? (
        <div className="flex flex-col gap-3">
          {visibleItems.map((item) =>
            item.kind === 'link' ? (
              <LinkCard
                key={item.key}
                link={item.link!}
                userId={user.id}
                userVote={linkVotes[item.id]}
                isBookmarked={linkBookmarks[item.id]}
                className={item.link!.nsfw ? 'nsfw-text' : ''}
              />
            ) : (
              <PostCard
                key={item.key}
                post={item.post!}
                userId={user.id}
                userVote={postInteractions.votes[item.id]}
                isBookmarked={postInteractions.bookmarks[item.id]}
                className={item.post!.nsfw ? 'nsfw-text' : ''}
              />
            ),
          )}
        </div>
      ) : (
        <p className="rounded-lg border bg-card py-12 text-center text-muted-foreground">
          {copy.empty}
        </p>
      )}
    </div>
  )
}
