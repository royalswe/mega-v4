export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowUpDown, Check, ChevronDown, Filter } from 'lucide-react'

import { SubfeedAvatar } from '@/components/subfeeds/SubfeedAvatar'
import { JoinSubfeedButton } from '@/components/subfeeds/JoinSubfeedButton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { readRelationshipIds } from '@/lib/community/subfeeds'

type SubfeedSort = 'trending' | 'newest' | 'members'

const parseSort = (value: string | undefined): SubfeedSort => {
  if (value === 'newest' || value === 'members') return value
  return 'trending'
}

const parseToggle = (value: string | undefined): boolean => value === 'true'

export default async function SubfeedsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; q?: string; joined?: string; featured?: string }>
}) {
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()
  const resolvedSearchParams = await searchParams
  const selectedSort = parseSort(resolvedSearchParams.sort)
  const searchQuery = (resolvedSearchParams.q || '').trim()
  const searchQueryLower = searchQuery.toLowerCase()
  const featuredOnly = parseToggle(resolvedSearchParams.featured)
  const joinedOnly = parseToggle(resolvedSearchParams.joined)

  const createQueryHref = (options: {
    sort?: SubfeedSort
    joined?: boolean
    featured?: boolean
    q?: string
  }) => {
    const nextSort = options.sort ?? selectedSort
    const nextJoined = options.joined ?? joinedOnly
    const nextFeatured = options.featured ?? featuredOnly
    const nextQuery = options.q ?? searchQuery

    const params = new URLSearchParams()
    if (nextSort !== 'trending') {
      params.set('sort', nextSort)
    }
    if (nextJoined) {
      params.set('joined', 'true')
    }
    if (nextFeatured) {
      params.set('featured', 'true')
    }
    if (nextQuery.length > 0) {
      params.set('q', nextQuery)
    }

    const query = params.toString()
    return query.length > 0 ? `/subfeeds?${query}` : '/subfeeds'
  }

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
    sort: '-reputation',
    limit: 100,
    depth: 1,
    ...withAccess,
  })

  const subfeedIds = subfeeds.map((subfeed) => subfeed.id)
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [recentLinks, recentPosts] =
    subfeedIds.length > 0
      ? await Promise.all([
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
                    in: subfeedIds,
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
                    greater_than_equal: dayAgo,
                  },
                },
              ],
            },
            sort: '-createdAt',
            limit: 1000,
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
                    in: subfeedIds,
                  },
                },
                {
                  status: {
                    equals: 'published',
                  },
                },
                {
                  createdAt: {
                    greater_than_equal: dayAgo,
                  },
                },
              ],
            },
            sort: '-createdAt',
            limit: 1000,
            depth: 0,
            ...withAccess,
          }),
        ])
      : [{ docs: [] }, { docs: [] }]

  const linkCountBySubfeed = new Map<number, number>()
  for (const link of recentLinks.docs) {
    if (typeof link.subfeed !== 'number') continue
    linkCountBySubfeed.set(link.subfeed, (linkCountBySubfeed.get(link.subfeed) ?? 0) + 1)
  }

  const postCountBySubfeed = new Map<number, number>()
  for (const post of recentPosts.docs) {
    if (typeof post.subfeed !== 'number') continue
    postCountBySubfeed.set(post.subfeed, (postCountBySubfeed.get(post.subfeed) ?? 0) + 1)
  }

  const rankedSubfeeds = subfeeds
    .map((subfeed) => {
      const memberIds = readRelationshipIds(subfeed.members)
      const isMember = user ? memberIds.includes(user.id) : false
      const linksToday = linkCountBySubfeed.get(subfeed.id) ?? 0
      const postsToday = postCountBySubfeed.get(subfeed.id) ?? 0
      const activityToday = linksToday + postsToday

      return {
        subfeed,
        memberIds,
        isMember,
        linksToday,
        postsToday,
        activityToday,
      }
    })
    .filter(({ subfeed }) => {
      if (!searchQueryLower) return true
      return (
        subfeed.name.toLowerCase().includes(searchQueryLower) ||
        subfeed.description.toLowerCase().includes(searchQueryLower)
      )
    })
    .filter(({ subfeed, isMember }) => {
      if (featuredOnly && !subfeed.featured) return false
      if (joinedOnly && !isMember) return false
      return true
    })
    .sort((a, b) => {
      if (a.isMember !== b.isMember) {
        return a.isMember ? -1 : 1
      }

      if (selectedSort === 'members') {
        return b.memberIds.length - a.memberIds.length
      }

      if (selectedSort === 'newest') {
        return new Date(b.subfeed.createdAt).getTime() - new Date(a.subfeed.createdAt).getTime()
      }

      return (b.subfeed.reputation ?? 0) - (a.subfeed.reputation ?? 0)
    })

  const activeFilters = [
    selectedSort !== 'trending'
      ? {
          key: 'sort',
          label:
            selectedSort === 'newest'
              ? dict.subfeeds?.listControls?.sortOptions?.newest || 'Newest'
              : dict.subfeeds?.listControls?.sortOptions?.members || 'Most Members',
          href: createQueryHref({ sort: 'trending' }),
        }
      : null,
    joinedOnly
      ? {
          key: 'joined',
          label: dict.subfeeds?.listControls?.joinedOnly || 'Joined only',
          href: createQueryHref({ joined: false }),
        }
      : null,
    featuredOnly
      ? {
          key: 'featured',
          label: dict.subfeeds?.listControls?.featuredOnly || 'Featured only',
          href: createQueryHref({ featured: false }),
        }
      : null,
    searchQuery.length > 0
      ? {
          key: 'search',
          label: `${dict.subfeeds?.listControls?.searchFilterPrefix || 'Search'}: ${searchQuery}`,
          href: createQueryHref({ q: '' }),
        }
      : null,
  ].filter((filter): filter is { key: string; label: string; href: string } => Boolean(filter))

  const clearAllHref = createQueryHref({
    sort: 'trending',
    joined: false,
    featured: false,
    q: '',
  })

  const selectedSortLabel =
    selectedSort === 'newest'
      ? dict.subfeeds?.listControls?.sortOptions?.newest || 'Newest'
      : selectedSort === 'members'
        ? dict.subfeeds?.listControls?.sortOptions?.members || 'Most Members'
        : dict.subfeeds?.listControls?.sortOptions?.trending || 'Trending'

  const activeFilterCount = [joinedOnly, featuredOnly, searchQuery.length > 0].filter(
    Boolean,
  ).length
  const hasActiveFilters = activeFilters.length > 0
  const resultCountLabel =
    rankedSubfeeds.length === 1
      ? dict.subfeeds?.listControls?.resultCountSingular || 'subfeed found'
      : dict.subfeeds?.listControls?.resultCountPlural || 'subfeeds found'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{dict.subfeeds?.title || 'SubFeeds'}</h1>
          <p className="text-muted-foreground">
            {dict.subfeeds?.subtitle ||
              'Explore niche communities and join the ones you care about.'}
          </p>
        </div>

        {user ? (
          <Button asChild>
            <Link href="/subfeeds/new">{dict.subfeeds?.createButton || 'Create SubFeed'}</Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/login">{dict.subfeeds?.loginToCreate || 'Log in to create'}</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
              >
                <ArrowUpDown className="size-3.5" aria-hidden="true" />
                <span>{selectedSortLabel}</span>
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-20 min-w-44">
              <DropdownMenuItem
                asChild
                className={
                  selectedSort === 'trending' ? 'bg-muted font-medium text-foreground' : ''
                }
              >
                <Link href={createQueryHref({ sort: 'trending' })}>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span>{dict.subfeeds?.listControls?.sortOptions?.trending || 'Trending'}</span>
                    {selectedSort === 'trending' ? <Check className="size-3.5" /> : null}
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className={selectedSort === 'newest' ? 'bg-muted font-medium text-foreground' : ''}
              >
                <Link href={createQueryHref({ sort: 'newest' })}>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span>{dict.subfeeds?.listControls?.sortOptions?.newest || 'Newest'}</span>
                    {selectedSort === 'newest' ? <Check className="size-3.5" /> : null}
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className={selectedSort === 'members' ? 'bg-muted font-medium text-foreground' : ''}
              >
                <Link href={createQueryHref({ sort: 'members' })}>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span>
                      {dict.subfeeds?.listControls?.sortOptions?.members || 'Most Members'}
                    </span>
                    {selectedSort === 'members' ? <Check className="size-3.5" /> : null}
                  </span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`flex cursor-pointer items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground ${activeFilterCount > 0 ? 'border-blue-500/50 text-foreground' : ''}`}
              >
                <Filter className="size-3.5" aria-hidden="true" />
                <span>
                  {dict.subfeeds?.listControls?.filterLabel || 'Filter'}
                  {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </span>
                {activeFilterCount > 0 ? (
                  <span className="size-1.5 rounded-full bg-blue-500" aria-hidden="true" />
                ) : null}
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-20 min-w-44">
              {user ? (
                <DropdownMenuItem
                  asChild
                  className={joinedOnly ? 'bg-muted font-medium text-foreground' : ''}
                >
                  <Link href={createQueryHref({ joined: !joinedOnly })}>
                    <span className="flex w-full items-center justify-between gap-2">
                      <span>{dict.subfeeds?.listControls?.joinedOnly || 'Joined only'}</span>
                      {joinedOnly ? <Check className="size-3.5" /> : null}
                    </span>
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                asChild
                className={featuredOnly ? 'bg-muted font-medium text-foreground' : ''}
              >
                <Link href={createQueryHref({ featured: !featuredOnly })}>
                  <span className="flex w-full items-center justify-between gap-2">
                    <span>{dict.subfeeds?.listControls?.featuredOnly || 'Featured only'}</span>
                    {featuredOnly ? <Check className="size-3.5" /> : null}
                  </span>
                </Link>
              </DropdownMenuItem>
              {activeFilterCount > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={clearAllHref}>
                      {dict.subfeeds?.listControls?.clearAll || 'Clear all'}
                    </Link>
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <form
          action="/subfeeds"
          method="get"
          className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-row"
        >
          {selectedSort !== 'trending' ? (
            <input type="hidden" name="sort" value={selectedSort} />
          ) : null}
          {joinedOnly ? <input type="hidden" name="joined" value="true" /> : null}
          {featuredOnly ? <input type="hidden" name="featured" value="true" /> : null}
          <Input
            name="q"
            defaultValue={searchQuery}
            placeholder={dict.subfeeds?.listControls?.searchPlaceholder || 'Search subfeeds'}
          />
          <Button type="submit" variant="outline">
            {dict.subfeeds?.listControls?.searchButton || 'Search'}
          </Button>
        </form>
      </div>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            {dict.subfeeds?.listControls?.activeFiltersLabel || 'Active filters'}
          </span>
          {activeFilters.map((filter) => (
            <Link
              key={filter.key}
              href={filter.href}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-1 text-foreground transition hover:bg-muted"
              aria-label={`${dict.subfeeds?.listControls?.removeFilter || 'Remove filter'}: ${filter.label}`}
            >
              <span>{filter.label}</span>
              <span aria-hidden="true">x</span>
            </Link>
          ))}
          <Link
            href={clearAllHref}
            className="text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
          >
            {dict.subfeeds?.listControls?.clearAll || 'Clear all'}
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col justify-between gap-2 px-1 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <span>
          {rankedSubfeeds.length} {resultCountLabel}
        </span>
        {rankedSubfeeds.length === 0 && hasActiveFilters ? (
          <Link
            href={clearAllHref}
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {dict.subfeeds?.listControls?.resetEmptyState || 'Reset filters'}
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4">
        {rankedSubfeeds.map(
          ({ subfeed, memberIds, isMember, linksToday, postsToday, activityToday }) => {
            return (
              <Card key={subfeed.id}>
                <CardHeader>
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <CardTitle>
                        <Link
                          href={`/subfeeds/${subfeed.slug}`}
                          className="inline-flex items-center gap-1.5 wrap-break-word hover:underline"
                        >
                          <SubfeedAvatar
                            subfeed={subfeed}
                            className="size-5 shrink-0 rounded-full object-cover"
                            fallbackClassName="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold"
                          />
                          {subfeed.name}
                        </Link>
                      </CardTitle>
                      <CardDescription className="wrap-break-word">
                        {subfeed.description}
                      </CardDescription>
                    </div>
                    {subfeed.featured ? (
                      <span className="rounded-full border px-2 py-1 text-xs font-medium">
                        {dict.subfeeds?.featured || 'Featured'}
                      </span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 text-sm text-muted-foreground">
                    <p>
                      {memberIds.length} {dict.subfeeds?.membersLabel || 'members'}
                    </p>
                    <p>
                      {dict.subfeeds?.reputationLabel || 'Reputation'}: {subfeed.reputation ?? 0}
                    </p>
                    <p>
                      {activityToday > 0
                        ? `${dict.subfeeds?.listControls?.activityToday || 'Active today'}: ${linksToday} ${dict.subfeeds?.listControls?.linksToday || 'links'}, ${postsToday} ${dict.subfeeds?.listControls?.postsToday || 'posts'}`
                        : dict.subfeeds?.listControls?.quietToday || 'Quiet today'}
                    </p>
                  </div>
                  <div className="w-full sm:w-auto">
                    {user ? (
                      <JoinSubfeedButton
                        subfeedId={subfeed.id}
                        isMember={isMember}
                        labels={dict.subfeeds?.joinButton}
                      />
                    ) : (
                      <Button asChild variant="outline" className="w-full sm:w-auto">
                        <Link href="/login">{dict.subfeeds?.loginToJoin || 'Log in to join'}</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          },
        )}

        {rankedSubfeeds.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              {searchQuery
                ? dict.subfeeds?.listControls?.emptySearch || 'No subfeeds match your search.'
                : hasActiveFilters
                  ? dict.subfeeds?.listControls?.emptyFiltered ||
                    'No subfeeds match your active filters.'
                  : dict.subfeeds?.emptyState ||
                    'No subfeeds yet. Create the first one and shape the conversation.'}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
