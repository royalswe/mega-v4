export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'

import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { buildPublicFeedVisibilityWhere } from '@/lib/community/visibility'
import { hydrateFeedCardRelations } from '@/lib/community/feedAssembly'
import { promotionThresholdForFeed } from '@/lib/community/promotion'
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

export default async function MyFeedPage() {
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  if (!user) {
    redirect('/login')
  }

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

  const trustProgression = buildTrustProgression(readNum(user.totalMemberValue), user.trustLevel)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="text-muted-foreground max-w-2xl">{copy.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
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

      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => {
            const isLink = item.kind === 'link'
            const doc = isLink ? item.link! : item.post!
            const href = isLink ? `/link/${item.id}` : `/post/${item.id}`
            const title = isLink ? item.link!.title : item.post!.title
            const progress = progressOf(doc)

            return (
              <div key={item.key} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{isLink ? '🔗 Länk' : '💬 Diskussion'}</span>
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
                <Link
                  href={href}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                >
                  <ServerIcon icon={MESSAGE_CIRCLE} className="size-3.5" />
                  {readNum(doc.commentsCount)} {dict.common.comments}
                  <ServerIcon icon={EXTERNAL_LINK} className="ml-1 size-3" />
                </Link>
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
