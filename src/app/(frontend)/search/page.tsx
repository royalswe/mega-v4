import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { LinkCard } from '@/components/links/LinkCard'
import { PostCard } from '@/components/posts/PostCard'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/users/Avatar'
import Link from 'next/link'
import { getUserInteractions } from '@/app/(frontend)/data/getInteractions'
import { getPostInteractions } from '@/app/(frontend)/data/getPostInteractions'
import { checkRole } from '@/access/checkRole'

export const dynamic = 'force-dynamic'

interface SearchPageProps {
  searchParams: Promise<{
    q?: string
    type?: string
  }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q, type } = await searchParams
  const query = typeof q === 'string' ? q.trim() : ''
  const activeTab =
    typeof type === 'string' && ['links', 'posts', 'users'].includes(type) ? type : 'links'

  const { user, payload } = await getAuthenticatedUser()
  const canQuickEditLinks = user ? checkRole(['admin'], user) : false

  const withAccess = user
    ? {
        user,
        overrideAccess: false as const,
      }
    : {
        overrideAccess: false as const,
      }

  let users: any[] = []
  let posts: any[] = []
  let links: any[] = []

  if (query) {
    const [usersRes, postsRes, linksRes] = await Promise.all([
      payload.find({
        collection: 'users',
        where: {
          username: {
            contains: query,
          },
        },
        limit: 30,
        ...withAccess,
      }),
      payload.find({
        collection: 'posts',
        where: {
          or: [{ title: { contains: query } }, { slug: { contains: query } }],
        },
        limit: 30,
        ...withAccess,
      }),
      payload.find({
        collection: 'links',
        where: {
          or: [
            { title: { contains: query } },
            { description: { contains: query } },
            { url: { contains: query } },
          ],
        },
        limit: 30,
        ...withAccess,
      }),
    ])

    users = usersRes.docs
    posts = postsRes.docs
    links = linksRes.docs
  }

  // Fetch interactions for rendering cards properly
  const linkIds = links.map((l) => l.id)
  const postIds = posts.map((p) => p.id)

  const [linkInteractions, postInteractions] = await Promise.all([
    getUserInteractions(user, linkIds),
    getPostInteractions(user, postIds),
  ])

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

    quickEditSubfeeds = subfeedsForEdit.map((subfeed) => ({
      id: subfeed.id,
      name: subfeed.name,
    }))
  }

  return (
    <div className="container max-w-4xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Search Results</h1>
        {query ? (
          <p className="text-muted-foreground">
            Showing results for &ldquo;
            <span className="font-semibold text-foreground">{query}</span>&rdquo;
          </p>
        ) : (
          <p className="text-muted-foreground">
            Enter a search query to search across the platform.
          </p>
        )}
      </div>

      {/* Search Input Box on the page */}
      <form role="search" action="/search" method="get" className="mb-8 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search usernames, posts, links..."
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Search site"
          required
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
        >
          Search
        </button>
      </form>

      {query && (
        <div className="space-y-6">
          {/* Tabs */}
          <div className="flex border-b">
            <Link
              href={`/search?q=${encodeURIComponent(query)}&type=links`}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-[2px] transition-colors ${
                activeTab === 'links'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Links ({links.length})
            </Link>
            <Link
              href={`/search?q=${encodeURIComponent(query)}&type=posts`}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-[2px] transition-colors ${
                activeTab === 'posts'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Posts ({posts.length})
            </Link>
            <Link
              href={`/search?q=${encodeURIComponent(query)}&type=users`}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-[2px] transition-colors ${
                activeTab === 'users'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Users ({users.length})
            </Link>
          </div>

          {/* Active Tab Contents */}
          <div className="space-y-4">
            {activeTab === 'links' && (
              <>
                {links.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No links found matching your query.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {links.map((link) => (
                      <LinkCard
                        key={link.id}
                        link={link}
                        userId={user?.id}
                        userVote={linkInteractions.votes[link.id]}
                        isBookmarked={linkInteractions.bookmarks[link.id]}
                        quickEditEnabled={canQuickEditLinks}
                        quickEditSubfeeds={quickEditSubfeeds}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'posts' && (
              <>
                {posts.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No posts found matching your query.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {posts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        userId={user?.id}
                        userVote={postInteractions.votes[post.id]}
                        isBookmarked={postInteractions.bookmarks[post.id]}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'users' && (
              <>
                {users.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No users found matching your query.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {users.map((u) => (
                      <Link key={u.id} href={`/user/${u.username}`} className="block">
                        <Card className="hover:bg-muted/40 transition-colors border">
                          <CardContent className="p-4 flex items-center gap-4">
                            <Avatar user={u} className="h-12 w-12 text-lg shrink-0" />
                            <div>
                              <h3 className="font-semibold text-sm hover:underline">
                                {u.username}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                {u.reputationPublicLabel || u.trustLevel || 'Member'}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
