export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { Where } from 'payload'

import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { buildPublicFeedVisibilityWhere } from '@/lib/community/visibility'
import { hydrateFeedCardRelations } from '@/lib/community/feedAssembly'
import { hasDiscoveryBoostStanding, promotionThresholdForFeed } from '@/lib/community/promotion'
import { DiscoverBoostButton } from '@/components/discover/DiscoverBoostButton.client'
import { ServerIcon, EXTERNAL_LINK, MESSAGE_CIRCLE } from '@/components/ui/ServerIcon'

import type { Link as LinkDoc, Post as PostDoc } from '@/payload-types'

type RadarItem =
  | { kind: 'link'; id: number; createdAt: number; link: LinkDoc }
  | { kind: 'post'; id: number; createdAt: number; post: PostDoc }

const readNum = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

/** Fraction toward the Main Feed promotion gate, for the climb meter. */
const progressOf = (item: {
  score?: number | null
  upvotes?: number | null
  rankingScore?: number | null
}): number => {
  const threshold = promotionThresholdForFeed('user')
  const raw = Math.min(
    readNum(item.score) / threshold.score,
    readNum(item.upvotes) / threshold.upvotes,
    readNum(item.rankingScore) / threshold.rankingScore,
  )
  return Math.max(0, Math.min(1, raw))
}

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
  commentsCount: true,
  createdAt: true,
  updatedAt: true,
  nsfw: true,
  score: true,
  upvotes: true,
  rankingScore: true,
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
} as const

export default async function DiscoverPage() {
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()
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

  const items: RadarItem[] = [
    ...links.map((link) => ({
      kind: 'link' as const,
      id: link.id,
      createdAt: Date.parse(link.createdAt),
      link,
    })),
    ...posts.map((post) => ({
      kind: 'post' as const,
      id: post.id,
      createdAt: Date.parse(post.createdAt),
      post,
    })),
  ].sort((a, b) => (Number.isNaN(b.createdAt) ? 0 : b.createdAt) - (Number.isNaN(a.createdAt) ? 0 : a.createdAt))

  const canBoost = user ? hasDiscoveryBoostStanding(user) : false

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="text-muted-foreground max-w-2xl">{copy.subtitle}</p>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => {
            const isLink = item.kind === 'link'
            const doc = isLink ? item.link : item.post
            const href = isLink ? `/link/${item.link.id}` : `/post/${item.post.id}`
            const title = isLink ? item.link.title : item.post.title
            const progress = progressOf(doc)
            const author = typeof doc.user === 'object' && doc.user?.username ? doc.user.username : null

            return (
              <div key={`${item.kind}-${item.id}`} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {isLink ? '🔗 Länk' : '💬 Diskussion'}
                    {author ? ` · Från @${author}` : ''}
                  </span>
                  <span>{Math.round(progress * 100)}% mot Main Feed</span>
                </div>
                <Link href={href} className="mb-2 block text-base font-semibold leading-snug hover:underline">
                  {title}
                </Link>
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={href}
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <ServerIcon icon={MESSAGE_CIRCLE} className="size-3.5" />
                    {readNum(doc.commentsCount)} {dict.common.comments}
                    <ServerIcon icon={EXTERNAL_LINK} className="ml-1 size-3" />
                  </Link>
                  {user && canBoost ? (
                    <DiscoverBoostButton
                      collection={isLink ? 'links' : 'posts'}
                      id={item.id}
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
                  ) : user ? (
                    <span className="text-xs text-muted-foreground">{copy.needsStanding}</span>
                  ) : (
                    <Link href="/login" className="text-xs font-medium text-sky-500 hover:underline">
                      {dict.menu.login} · {copy.boost}
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="rounded-lg border bg-card py-12 text-center text-muted-foreground">{copy.empty}</p>
      )}
    </div>
  )
}
