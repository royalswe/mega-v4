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
import { SubfeedRoster } from '@/components/subfeeds/SubfeedRoster'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import {
  canModerateCommunity,
  canModerateSubfeedContent,
  canSubmitToSubfeed,
  readRelationshipIds,
  resolveSubfeedOwner,
} from '@/lib/community/subfeeds'
import {
  loadSubfeedFeed,
  mapRoster,
  parseContentFilter,
  parsePulseWindow,
} from '@/lib/community/feedAssembly'
import { checkRole } from '@/access/checkRole'
import { expireEditorialPriority } from '@/lib/community/editorialPriority'
import { ReorderAwareList } from '@/components/links/ReorderAwareList.client'

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
  // Selection and mixed-content ordering use persisted ranking scores.
  await expireEditorialPriority({ payload, force: true }).catch((error: unknown) => {
    payload.logger.error({ err: error, msg: 'Failed to expire editorial priority on Subfeed page' })
  })
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
  const isMember = user ? memberIds.includes(user.id) : false
  const canEditSubfeed = user
    ? canModerateCommunity(user) || canModerateSubfeedContent(subfeed, user.id)
    : false
  const canManageRoster = canEditSubfeed
  const canCreate = user
    ? canSubmitToSubfeed(subfeed, user.id) || canModerateCommunity(user)
    : false
  const avatarMedia = typeof subfeed.avatar === 'object' && subfeed.avatar ? subfeed.avatar : null

  const rosterModerators = mapRoster(subfeed.moderators)
  const rosterEditors = mapRoster(subfeed.editors)
  const rosterUploaders = mapRoster(subfeed.uploaders)
  const rosterMembers = mapRoster(subfeed.members)
  const ownerId = resolveSubfeedOwner(subfeed)
  const rosterOwner =
    [...rosterModerators, ...rosterEditors, ...rosterUploaders, ...rosterMembers].find(
      (member) => member.id === ownerId,
    ) ?? (ownerId !== null ? { id: ownerId, username: `User #${ownerId}` } : null)

  const {
    links,
    posts,
    filteredItems,
    activity,
    activityDelta,
    newLinks,
    newPosts,
    trendPoints,
    trendBucketLabels,
    trendingTopics,
    quickEditSubfeeds,
  } = await loadSubfeedFeed({
    payload,
    user,
    subfeed,
    selectedWindow,
    selectedContentFilter,
    canQuickEditLinks,
    lang,
  })

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
              <h1 className="wrap-break-word">{subfeed.name}</h1>
            </div>
            <p className="max-w-2xl text-muted-foreground wrap-break-word">{subfeed.description}</p>
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
            <p className="whitespace-pre-wrap text-sm text-muted-foreground wrap-break-word">{subfeed.rules}</p>
          </div>
        ) : null}
      </section>

      <SubfeedRoster
        subfeedId={subfeed.id}
        canManage={canManageRoster}
        owner={rosterOwner}
        moderators={rosterModerators}
        editors={rosterEditors}
        uploaders={rosterUploaders}
        members={rosterMembers}
        currentUserId={user?.id}
        labels={dict.subfeeds.roster}
      />

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

        {user && !canCreate ? (
          <div
            data-testid="subfeed-ineligible-publish-note"
            className="rounded-md border bg-muted/30 p-3 text-sm"
          >
            <p className="font-medium">{dict.subfeeds.publishToYourFeedAction}</p>
            <p className="text-muted-foreground">{dict.subfeeds.ineligiblePublishNote}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button asChild size="sm">
                <Link href="/new-link">{dict.pages.contribute.shareLinkAction}</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/new-post">{dict.pages.contribute.startDiscussionAction}</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {filteredItems.length > 0 ? (
          <ReorderAwareList itemIds={filteredItems.map((item) => `${item.type}-${item.id}`)}>
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
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              {canCreate ? (
                <>
                  <p className="text-lg font-semibold">{dict.subfeeds.emptyFeed.memberTitle}</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    {dict.subfeeds.emptyFeed.memberSubtitle}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
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
                  </div>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold">{dict.subfeeds.emptyFeed.guestTitle}</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    {dict.subfeeds.emptyFeed.guestSubtitle}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    {user ? (
                      <JoinSubfeedButton
                        subfeedId={subfeed.id}
                        isMember={isMember}
                        labels={dict.subfeeds?.joinButton}
                      />
                    ) : (
                      <Button asChild>
                        <Link href="/login">{dict.subfeeds.emptyFeed.loginAction}</Link>
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
