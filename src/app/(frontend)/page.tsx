export const dynamic = 'force-dynamic' // This stops the build-time DB check

import Link from 'next/link'
import { cookies } from 'next/headers'

import { LinkCard } from '@/components/links/LinkCard'
import { getUserInteractions } from '@/app/(frontend)/data/getInteractions'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { BookmarksFilter } from '@/components/links/BookmarksFilter'
import { FeedMixFilter } from '@/components/links/FeedMixFilter'
import { HomeContributeCard } from '@/components/links/HomeContributeCard.client'
import { MainFeedHighlights } from '@/components/links/MainFeedHighlights'
import { ReorderAwareList } from '@/components/links/ReorderAwareList.client'
import type { FeedMode, FeedSignal } from '@/lib/community/feedAssembly'
import {
  loadHomeFeed,
  parseHomeSubfeedsView,
  parseMode,
  parseSignal,
} from '@/lib/community/feedAssembly'
import { checkRole } from '@/access/checkRole'
import { expireEditorialPriority } from '@/lib/community/editorialPriority'
import { parseFeedPage } from '@/app/(frontend)/data/feedPaging'
import { LazyFeedLoader } from '@/components/links/LazyFeedLoader.client'

const toQuery = (params: {
  bookmarks?: string
  mixSubfeeds?: string
  signal?: string
  mode?: string
}) => {
  const query = new URLSearchParams()
  if (params.bookmarks) query.set('bookmarks', params.bookmarks)
  if (params.mixSubfeeds) query.set('mixSubfeeds', params.mixSubfeeds)
  if (params.signal) query.set('signal', params.signal)
  if (params.mode && params.mode !== 'best') query.set('mode', params.mode)
  return query
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    bookmarks?: string
    mixSubfeeds?: string
    signal?: string
    mode?: string
    page?: string
  }>
}) {
  const { user, payload } = await getAuthenticatedUser()
  const { dict, lang } = await getDictionary()
  const cookieStore = await cookies()
  const resolvedSearchParams = await searchParams
  const feedPage = parseFeedPage(resolvedSearchParams?.page)

  // Ranking is persisted on writes; clear expired boosts before selecting
  // items, even if another render swept within the normal throttle window.
  await expireEditorialPriority({ payload, force: true }).catch((error: unknown) => {
    payload.logger.error({ err: error, msg: 'Failed to expire editorial priority on Home feed' })
  })

  const showBookmarksOnly = resolvedSearchParams?.bookmarks === 'true'
  const persistedMixSubfeeds = cookieStore.get('mixSubfeeds')?.value === 'true'
  const persistedHomeSubfeedsView = parseHomeSubfeedsView(
    cookieStore.get('homeSubfeedsView')?.value,
  )
  const canQuickEditLinks = user ? checkRole(['admin'], user) : false
  const mixSubfeedsParam = resolvedSearchParams?.mixSubfeeds
  const includeSubfeeds = Boolean(
    user &&
    (mixSubfeedsParam === 'true'
      ? true
      : mixSubfeedsParam === 'false'
        ? false
        : persistedMixSubfeeds),
  )
  const signal = parseSignal(resolvedSearchParams.signal)
  const mode = parseMode(resolvedSearchParams.mode)

  const buildSignalHref = (nextSignal: FeedSignal | null) => {
    const query = toQuery({
      bookmarks: resolvedSearchParams.bookmarks,
      mixSubfeeds: resolvedSearchParams.mixSubfeeds,
      signal: nextSignal ?? undefined,
      mode,
    })

    const queryString = query.toString()
    return queryString.length > 0 ? `/?${queryString}` : '/'
  }

  const buildModeHref = (nextMode: FeedMode) => {
    const query = toQuery({
      bookmarks: resolvedSearchParams.bookmarks,
      mixSubfeeds: resolvedSearchParams.mixSubfeeds,
      signal: resolvedSearchParams.signal,
      mode: nextMode,
    })

    const queryString = query.toString()
    return queryString.length > 0 ? `/?${queryString}` : '/'
  }

  const signalLabelByKey: Record<FeedSignal, string> = {
    trending: dict.pages.highlights.trendingNow,
    subfeeds: dict.pages.highlights.newInYourSubfeeds,
    discussions: dict.pages.highlights.freshDiscussions,
  }

  const modeDescriptionByKey: Record<FeedMode, string> = {
    best: dict.pages.modeDescriptions.best,
    new: dict.pages.modeDescriptions.newest,
    rising: dict.pages.modeDescriptions.rising,
  }

  const {
    links,
    quickEditSubfeeds,
    publishingEligibility,
    selectedSubfeedStripView,
    activeSubfeedStrip,
    joinedSubfeedsSidebar,
    trendingNowCount,
    newInYourSubfeedsCount,
    freshDiscussionsCount,
    trendingNowTrend,
    newInYourSubfeedsTrend,
    freshDiscussionsTrend,
    contributeVariant,
    hasMoreLinks,
  } = await loadHomeFeed({
    payload,
    user,
    mode,
    signal,
    feedPage,
    showBookmarksOnly,
    includeSubfeeds,
    persistedHomeSubfeedsView,
    canQuickEditLinks,
  })

  // Fetch user interactions (votes/bookmarks)
  const { votes, bookmarks } = await getUserInteractions(
    user,
    links.map((link) => link.id),
  )

  const contributeCardCollapsed = cookieStore.get('contributeCardCollapsed')?.value === 'true'

  // Lazy feed paging: the next page URL keeps every active filter.
  const nextPageQuery = toQuery({
    bookmarks: resolvedSearchParams.bookmarks,
    mixSubfeeds: resolvedSearchParams.mixSubfeeds,
    signal: resolvedSearchParams.signal,
    mode,
  })
  nextPageQuery.set('page', String(feedPage + 1))
  const nextFeedHref = `/?${nextPageQuery.toString()}`

  return (
    <div className="space-y-4">
      <MainFeedHighlights
        labels={dict.pages.highlights}
        trendingNowCount={trendingNowCount}
        newInYourSubfeedsCount={newInYourSubfeedsCount}
        freshDiscussionsCount={freshDiscussionsCount}
        trendingNowHref={buildSignalHref(signal === 'trending' ? null : 'trending')}
        newInYourSubfeedsHref={buildSignalHref(signal === 'subfeeds' ? null : 'subfeeds')}
        freshDiscussionsHref={buildSignalHref(signal === 'discussions' ? null : 'discussions')}
        trendingNowTrend={trendingNowTrend}
        newInYourSubfeedsTrend={newInYourSubfeedsTrend}
        freshDiscussionsTrend={freshDiscussionsTrend}
        activeSignal={signal}
      />

      <HomeContributeCard
        dict={dict}
        lang={lang}
        variant={contributeVariant}
        eligibleSubfeeds={publishingEligibility.eligibleSubfeeds}
        canPublishToMain={publishingEligibility.canPublishToMain}
        initialCollapsed={contributeCardCollapsed}
        stripItems={activeSubfeedStrip}
        stripView={selectedSubfeedStripView}
        hasJoinedSubfeeds={joinedSubfeedsSidebar.length > 0}
      />

      <div>
        <div className="mb-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0 space-y-2">
            <div className="inline-flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1 text-xs">
              <span className="px-2 text-muted-foreground">{dict.pages.modeLabel}</span>
              <Link
                href={buildModeHref('best')}
                className={`rounded px-2 py-1 ${mode === 'best' ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {dict.pages.modes.best}
              </Link>
              <Link
                href={buildModeHref('new')}
                className={`rounded px-2 py-1 ${mode === 'new' ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {dict.pages.modes.newest}
              </Link>
              <Link
                href={buildModeHref('rising')}
                className={`rounded px-2 py-1 ${mode === 'rising' ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {dict.pages.modes.rising}
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">{modeDescriptionByKey[mode]}</p>
            {signal ? (
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-sky-300/70 bg-sky-50 px-3 py-1 text-xs text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100">
                <span>
                  {dict.pages.highlights.activeFilterPrefix}: {signalLabelByKey[signal]}
                </span>
                <Link
                  href={buildSignalHref(null)}
                  className="font-medium underline decoration-sky-400/70 underline-offset-2 hover:text-sky-700 dark:hover:text-sky-200"
                >
                  {dict.pages.highlights.clearFilter}
                </Link>
              </div>
            ) : null}
          </div>
          {user ? (
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
              <FeedMixFilter
                initialValue={includeSubfeeds}
                label={dict.pages.mixSubfeeds || 'Include links from my SubFeeds'}
                description={dict.pages.mainFeedOnly || 'Main feed only'}
              />
              <BookmarksFilter label={dict.pages.bookmarksOnly} />
            </div>
          ) : null}
        </div>

        <div>
          {links.length > 0 ? (
            <>
              <ReorderAwareList itemIds={links.map((link) => link.id)}>
                {links.map((link) => (
                  <LinkCard
                    key={link.id}
                    link={link}
                    userId={user?.id}
                    userVote={votes[link.id]}
                    isBookmarked={bookmarks[link.id]}
                    quickEditEnabled={canQuickEditLinks}
                    quickEditSubfeeds={quickEditSubfeeds}
                    className={link.nsfw ? 'nsfw-text' : ''}
                  />
                ))}
              </ReorderAwareList>
              {hasMoreLinks ? (
                <LazyFeedLoader nextHref={nextFeedHref} pendingLabel={dict.pages.loadingMore} />
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground py-8 text-center">
              {showBookmarksOnly ? dict.pages.noBookmarks : dict.pages.noLinks}{' '}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
