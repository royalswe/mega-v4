export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { Where } from 'payload'

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
import { hasDiscoveryBoostStanding } from '@/lib/community/promotion'
import { DiscoverBoostButton } from '@/components/discover/DiscoverBoostButton.client'

import type { Link as LinkDoc, Post as PostDoc } from '@/payload-types'

type RadarItem =
  | { kind: 'link'; id: number; createdAt: number; link: LinkDoc }
  | { kind: 'post'; id: number; createdAt: number; post: PostDoc }

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

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams?: Promise<{ type?: string }>
}) {
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()
  const resolvedSearchParams = (await searchParams) ?? {}
  const contentFilter = parseContentFilter(resolvedSearchParams.type)
  const copy = dict.pages.discover
  const withAccess = user
    ? { user, overrideAccess: false as const }
    : { overrideAccess: false as const }

  // Fresh, un-promoted User Feed content across both kinds.
  const radarWhere = (collection: 'links' | 'posts'): Where => ({
    and: [
      ...buildPublicFeedVisibilityWhere({ collection, viewer: user }),
      { feed: { equals: 'user' } },
      { featured: { not_equals: true } },
      { discoveryBoosted: { not_equals: true } },
    ],
  })

  const [linksRes, postsRes] = await Promise.all([
    payload.find({
      collection: 'links',
      where: radarWhere('links'),
      sort: '-createdAt',
      limit: 25,
      depth: 0,
      select: LINK_SELECT,
      ...withAccess,
    }),
    payload.find({
      collection: 'posts',
      where: radarWhere('posts'),
      sort: '-createdAt',
      limit: 25,
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

  const items: RadarItem[] = [
    ...links.map((link) => ({
      kind: 'link' as const,
      id: link.id,
      createdAt: Date.parse(link.createdAt),
      link: link as LinkDoc,
    })),
    ...posts.map((post) => ({
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

  const canBoost = user ? hasDiscoveryBoostStanding(user) : false

  const buildTypeHref = (nextType: SubfeedContentFilter) =>
    nextType === 'all' ? '/discover' : `/discover?type=${nextType}`

  const renderBoostSlot = (collection: 'links' | 'posts', id: number) => {
    if (user && canBoost) {
      return (
        <DiscoverBoostButton
          collection={collection}
          id={id}
          boostLabel={copy.boost}
          boostedLabel={copy.boosted}
          errorLabels={{
            notLoggedIn: dict.menu.login,
            noStanding: copy.needsStanding,
            ineligible: copy.ineligible,
            notFound: copy.notFound,
            invalid: copy.genericError,
          }}
        />
      )
    }

    if (user) {
      return <span className="text-xs text-muted-foreground">{copy.needsStanding}</span>
    }

    return (
      <Link href="/login" className="text-xs font-medium text-sky-500 hover:underline">
        {dict.menu.login} · {copy.boost}
      </Link>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="text-muted-foreground max-w-2xl">{copy.subtitle}</p>
        </div>
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
      </div>

      {visibleItems.length > 0 ? (
        <div className="flex flex-col gap-3">
          {visibleItems.map((item) =>
            item.kind === 'link' ? (
              <LinkCard
                key={`link-${item.id}`}
                link={item.link}
                userId={user?.id}
                userVote={linkVotes[item.id]}
                isBookmarked={linkBookmarks[item.id]}
                actionSlot={renderBoostSlot('links', item.id)}
                className={item.link.nsfw ? 'nsfw-text' : ''}
              />
            ) : (
              <PostCard
                key={`post-${item.id}`}
                post={item.post}
                userId={user?.id}
                userVote={postInteractions.votes[item.id]}
                isBookmarked={postInteractions.bookmarks[item.id]}
                actionSlot={renderBoostSlot('posts', item.id)}
                className={item.post.nsfw ? 'nsfw-text' : ''}
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
