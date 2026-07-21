export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getPostInteractions } from '@/app/(frontend)/data/getPostInteractions'
import { getUserInteractions } from '@/app/(frontend)/data/getInteractions'
import { LinkCard } from '@/components/links/LinkCard'
import { PostCard } from '@/components/posts/PostCard'
import { SubfeedAvatar } from '@/components/subfeeds/SubfeedAvatar'
import { JoinSubfeedButton } from '@/components/subfeeds/JoinSubfeedButton'
import { SubfeedCreatePanel } from '@/components/subfeeds/SubfeedCreatePanel'
import { SubfeedEditPanel } from '@/components/subfeeds/SubfeedEditPanel'
import { SubfeedPulseHeader } from '@/components/subfeeds/SubfeedPulseHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { canModerateCommunity, readRelationshipIds } from '@/lib/community/subfeeds'
import { checkRole } from '@/access/checkRole'
import { ReorderAwareList } from '@/components/links/ReorderAwareList.client'
import type { Link as LinkDoc, Post as PostDoc } from '@/payload-types'

const extractTrendingTopics = (items: Array<Pick<LinkDoc, 'tags'> | Pick<PostDoc, 'tags'>>) => {
  const seen = new Map<string, { label: string; count: number }>()

  for (const item of items) {
    for (const rawTag of item.tags ?? []) {
      const trimmed = rawTag.trim()
      if (!trimmed) continue

      const normalized = trimmed.toLowerCase()
      const existing = seen.get(normalized)

      if (existing) {
        existing.count += 1
      } else {
        seen.set(normalized, { label: trimmed, count: 1 })
      }
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.label.localeCompare(b.label)
    })
    .slice(0, 5)
    .map((topic) => topic.label)
}

const parsePulseWindow = (value: string | string[] | undefined): '24h' | '7d' => {
  const normalized = Array.isArray(value) ? value[0] : value
  if (normalized === '7d') return '7d'
  return '24h'
}

const parseContentFilter = (value: string | string[] | undefined): 'all' | 'links' | 'posts' => {
  const normalized = Array.isArray(value) ? value[0] : value
  if (normalized === 'links' || normalized === 'posts') return normalized
  return 'all'
}

const toSearchParams = (params: Record<string, string | string[] | undefined>) => {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const part of value) {
        if (typeof part === 'string' && part.length > 0) {
          query.append(key, part)
        }
      }
      continue
    }

    if (typeof value === 'string' && value.length > 0) {
      query.set(key, value)
    }
  }

  return query
}

const buildWindowHref = (
  slug: string,
  params: Record<string, string | string[] | undefined>,
  window: '24h' | '7d',
) => {
  const query = toSearchParams(params)
  query.set('window', window)
  return `/subfeeds/${slug}?${query.toString()}`
}

const buildContentFilterHref = (
  slug: string,
  params: Record<string, string | string[] | undefined>,
  filter: 'all' | 'links' | 'posts',
) => {
  const query = toSearchParams(params)

  if (filter === 'all') {
    query.delete('type')
  } else {
    query.set('type', filter)
  }

  const queryString = query.toString()
  return queryString.length > 0 ? `/subfeeds/${slug}?${queryString}` : `/subfeeds/${slug}`
}

const toIntlLocale = (lang: 'en' | 'sv') => {
  return lang === 'sv' ? 'sv-SE' : 'en-US'
}

const buildTrendBucketLabels = (now: number, window: '24h' | '7d', lang: 'en' | 'sv'): string[] => {
  const bucketCount = window === '24h' ? 8 : 7
  const windowMs = window === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  const bucketMs = windowMs / bucketCount
  const windowStart = now - windowMs
  const locale = toIntlLocale(lang)

  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  })
  const dayFormatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
  })

  return Array.from({ length: bucketCount }, (_, index) => {
    const start = new Date(windowStart + bucketMs * index)
    const end = new Date(windowStart + bucketMs * (index + 1))

    if (window === '24h') {
      return `${timeFormatter.format(start)}-${timeFormatter.format(end)}`
    }

    return dayFormatter.format(start)
  })
}

const buildTrendPoints = (
  createdAtValues: string[],
  now: number,
  window: '24h' | '7d',
): number[] => {
  const bucketCount = window === '24h' ? 8 : 7
  const windowMs = window === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  const bucketMs = windowMs / bucketCount

  const points = Array.from({ length: bucketCount }, () => 0)
  const windowStart = now - windowMs

  for (const timestamp of createdAtValues) {
    const createdAtMs = Date.parse(timestamp)
    if (Number.isNaN(createdAtMs)) continue
    if (createdAtMs < windowStart || createdAtMs > now) continue

    const elapsed = createdAtMs - windowStart
    const index = Math.min(bucketCount - 1, Math.floor(elapsed / bucketMs))
    points[index] += 1
  }

  return points
}

export default async function SubfeedDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([params, searchParams])
  const { user, payload } = await getAuthenticatedUser()
  const { dict, lang } = await getDictionary()
  const canQuickEditLinks = user ? checkRole(['admin'], user) : false
  const selectedWindow = parsePulseWindow(resolvedSearchParams.window)
  const selectedContentFilter = parseContentFilter(resolvedSearchParams.type)

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
  const moderatorIds = readRelationshipIds(subfeed.moderators)
  const canEditSubfeed = user ? canModerateCommunity(user) || moderatorIds.includes(user.id) : false
  const isMember = user ? memberIds.includes(user.id) : false
  const canCreate = user ? isMember || canModerateCommunity(user) : false
  const avatarMedia = typeof subfeed.avatar === 'object' && subfeed.avatar ? subfeed.avatar : null

  const now = Date.now()
  const windowMs = (selectedWindow === '24h' ? 24 : 7 * 24) * 60 * 60 * 1000
  const currentWindowStart = new Date(now - windowMs).toISOString()
  const previousWindowStart = new Date(now - windowMs * 2).toISOString()

  const [
    { docs: links },
    { docs: posts },
    currentLinks,
    currentPosts,
    previousLinks,
    previousPosts,
    recentLinks,
    recentPosts,
  ] = await Promise.all([
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
          {
            createdAt: {
              greater_than_equal: currentWindowStart,
            },
          },
        ],
      },
      limit: 0,
      depth: 0,
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
          {
            createdAt: {
              greater_than_equal: currentWindowStart,
            },
          },
        ],
      },
      limit: 0,
      depth: 0,
      ...withAccess,
    }),
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
          {
            createdAt: {
              greater_than_equal: previousWindowStart,
            },
          },
          {
            createdAt: {
              less_than: currentWindowStart,
            },
          },
        ],
      },
      limit: 0,
      depth: 0,
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
          {
            createdAt: {
              greater_than_equal: previousWindowStart,
            },
          },
          {
            createdAt: {
              less_than: currentWindowStart,
            },
          },
        ],
      },
      limit: 0,
      depth: 0,
      ...withAccess,
    }),
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
          {
            createdAt: {
              greater_than_equal: currentWindowStart,
            },
          },
        ],
      },
      limit: 300,
      depth: 0,
      sort: '-createdAt',
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
          {
            createdAt: {
              greater_than_equal: currentWindowStart,
            },
          },
        ],
      },
      limit: 300,
      depth: 0,
      sort: '-createdAt',
      ...withAccess,
    }),
  ])

  const newLinks = currentLinks.totalDocs
  const newPosts = currentPosts.totalDocs
  const activity = newLinks + newPosts

  const previousActivity = previousLinks.totalDocs + previousPosts.totalDocs
  const activityDelta = activity - previousActivity

  const trendPoints = buildTrendPoints(
    [...recentLinks.docs, ...recentPosts.docs].map((item) => item.createdAt),
    now,
    selectedWindow,
  )
  const trendBucketLabels = buildTrendBucketLabels(now, selectedWindow, lang)

  const trendingTopics = extractTrendingTopics([...recentLinks.docs, ...recentPosts.docs])

  const pulseLabels = {
    ...dict.subfeeds.pulse,
    activity24h:
      selectedWindow === '24h' ? dict.subfeeds.pulse.activity24h : dict.subfeeds.pulse.activity7d,
    delta24h: selectedWindow === '24h' ? dict.subfeeds.pulse.delta24h : dict.subfeeds.pulse.delta7d,
  }

  const linkIds = links.map((link) => link.id)
  const postIds = posts.map((post) => post.id)

  const [
    { votes: linkVotes, bookmarks: linkBookmarks },
    { votes: postVotes, bookmarks: postBookmarks },
  ] = await Promise.all([getUserInteractions(user, linkIds), getPostInteractions(user, postIds)])

  let quickEditSubfeeds: Array<{ id: number; name: string }> = []
  if (user && canQuickEditLinks) {
    const { docs: subfeedsForEdit } = await payload.find({
      collection: 'subfeeds',
      sort: 'name',
      depth: 0,
      limit: 200,
      user,
      overrideAccess: false,
    })

    quickEditSubfeeds = subfeedsForEdit.map((subfeedForEdit) => ({
      id: subfeedForEdit.id,
      name: subfeedForEdit.name,
    }))
  }

  const mixedItems = [
    ...links.map((link) => ({
      type: 'link' as const,
      id: link.id,
      rankingScore: link.rankingScore ?? 0,
      createdAt: Date.parse(link.createdAt),
      link,
    })),
    ...posts.map((post) => ({
      type: 'post' as const,
      id: post.id,
      rankingScore: post.rankingScore ?? 0,
      createdAt: Date.parse(post.createdAt),
      post,
    })),
  ]
    .sort((a, b) => {
      if (b.rankingScore !== a.rankingScore) {
        return b.rankingScore - a.rankingScore
      }

      return (
        (Number.isNaN(b.createdAt) ? 0 : b.createdAt) -
        (Number.isNaN(a.createdAt) ? 0 : a.createdAt)
      )
    })
    .slice(0, 50)

  const filteredItems = mixedItems.filter((item) => {
    if (selectedContentFilter === 'all') return true
    if (selectedContentFilter === 'links') return item.type === 'link'
    return item.type === 'post'
  })

  const filterLabels = {
    all: 'All',
    links: 'Links',
    posts: 'Posts',
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-3xl font-bold">
              <SubfeedAvatar
                subfeed={subfeed}
                className="h-10 w-10 rounded-full border object-cover"
                fallbackClassName="inline-flex h-10 w-10 items-center justify-center rounded-full border bg-muted text-sm font-semibold"
              />
              <h1>{subfeed.name}</h1>
            </div>
            <p className="max-w-2xl text-muted-foreground">{subfeed.description}</p>
            <p className="text-sm text-muted-foreground">
              {memberIds.length} {dict.subfeeds?.membersLabel || 'members'} •{' '}
              {dict.subfeeds?.reputationLabel || 'Reputation'} {subfeed.reputation ?? 0}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEditSubfeed ? (
              <SubfeedEditPanel
                dict={dict}
                subfeed={{
                  id: subfeed.id,
                  slug: subfeed.slug,
                  name: subfeed.name,
                  description: subfeed.description,
                  rules: subfeed.rules,
                  theme: subfeed.theme,
                  avatarUrl: avatarMedia?.url,
                }}
              />
            ) : null}
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

      <SubfeedPulseHeader
        labels={pulseLabels}
        activity24h={activity}
        delta24h={activityDelta}
        newLinks24h={newLinks}
        newPosts24h={newPosts}
        topics={trendingTopics}
        trendPoints={trendPoints}
        trendBucketLabels={trendBucketLabels}
        selectedWindow={selectedWindow}
        windowHrefs={{
          day: buildWindowHref(slug, resolvedSearchParams, '24h'),
          week: buildWindowHref(slug, resolvedSearchParams, '7d'),
        }}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Top Content</h2>
          <div className="flex flex-wrap items-center gap-2">
            {canCreate ? (
              <>
                <SubfeedCreatePanel
                  subfeedId={subfeed.id}
                  subfeedName={subfeed.name}
                  mode="link"
                  dict={dict}
                />
                <SubfeedCreatePanel
                  subfeedId={subfeed.id}
                  subfeedName={subfeed.name}
                  mode="post"
                  dict={dict}
                />
              </>
            ) : null}
            <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
              {(
                [
                  ['all', filterLabels.all],
                  ['links', filterLabels.links],
                  ['posts', filterLabels.posts],
                ] as const
              ).map(([value, label]) => {
                const isActive = selectedContentFilter === value
                return (
                  <Button key={value} asChild size="sm" variant={isActive ? 'default' : 'ghost'}>
                    <Link href={buildContentFilterHref(slug, resolvedSearchParams, value)}>
                      {label}
                    </Link>
                  </Button>
                )
              })}
            </div>
          </div>
        </div>

        {filteredItems.length > 0 ? (
          <ReorderAwareList itemIds={filteredItems.map((item) => item.id)}>
            {filteredItems.map((item) => {
              if (item.type === 'link') {
                return (
                  <LinkCard
                    key={`link-${item.id}`}
                    link={item.link}
                    userId={user?.id}
                    userVote={linkVotes[item.id]}
                    isBookmarked={linkBookmarks[item.id]}
                    quickEditEnabled={canQuickEditLinks}
                    quickEditSubfeeds={quickEditSubfeeds}
                    className={item.link.nsfw ? 'nsfw-text' : ''}
                  />
                )
              }

              return (
                <PostCard
                  key={`post-${item.id}`}
                  post={item.post}
                  userId={user?.id}
                  userVote={postVotes[item.id]}
                  isBookmarked={postBookmarks[item.id]}
                  className={item.post.nsfw ? 'nsfw-text' : ''}
                />
              )
            })}
          </ReorderAwareList>
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              {selectedContentFilter === 'links'
                ? dict.subfeeds?.noLinksYet || 'No links have been submitted to this subfeed yet.'
                : selectedContentFilter === 'posts'
                  ? dict.subfeeds?.noPostsYet ||
                    'No posts in this subfeed yet. Be the first to start a discussion.'
                  : 'No links or posts have been submitted to this subfeed yet.'}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
