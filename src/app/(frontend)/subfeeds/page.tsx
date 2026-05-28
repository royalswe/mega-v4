export const dynamic = 'force-dynamic'

import Link from 'next/link'

import { JoinSubfeedButton } from '@/components/subfeeds/JoinSubfeedButton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { readRelationshipIds } from '@/lib/community/subfeeds'

export default async function SubfeedsPage() {
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
    sort: '-reputation',
    limit: 100,
    depth: 0,
    ...withAccess,
  })

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

      <div className="grid gap-4">
        {subfeeds.map((subfeed) => {
          const memberIds = readRelationshipIds(subfeed.members)
          const isMember = user ? memberIds.includes(user.id) : false

          return (
            <Card key={subfeed.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>
                      <Link href={`/subfeeds/${subfeed.slug}`} className="hover:underline">
                        {subfeed.name}
                      </Link>
                    </CardTitle>
                    <CardDescription>{subfeed.description}</CardDescription>
                  </div>
                  {subfeed.featured ? (
                    <span className="rounded-full border px-2 py-1 text-xs font-medium">
                      {dict.subfeeds?.featured || 'Featured'}
                    </span>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  <p>
                    {memberIds.length} {dict.subfeeds?.membersLabel || 'members'}
                  </p>
                  <p>
                    {dict.subfeeds?.reputationLabel || 'Reputation'}: {subfeed.reputation ?? 0}
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
              </CardContent>
            </Card>
          )
        })}

        {subfeeds.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              {dict.subfeeds?.emptyState ||
                'No subfeeds yet. Create the first one and shape the conversation.'}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
