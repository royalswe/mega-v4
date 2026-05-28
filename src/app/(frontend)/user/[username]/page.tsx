import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { Avatar } from '@/components/users/Avatar'
import { AvatarUpload } from '@/components/users/AvatarUpload'
import { ProfileSettings } from '@/components/users/ProfileSettings'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarDays, Mail } from 'lucide-react'

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const decodedUsername = decodeURIComponent(username)

  const { user: currentUser, payload } = await getAuthenticatedUser()
  const { dict, lang } = await getDictionary()

  const withAccess = currentUser
    ? {
        user: currentUser,
        overrideAccess: false as const,
      }
    : {
        overrideAccess: false as const,
      }

  // First try to find by username
  const { docs: users } = await payload.find({
    collection: 'users',
    where: {
      username: {
        equals: decodedUsername,
      },
    },
    depth: 2, // Ensure we get avatar details
    ...withAccess,
  })

  // If not found by username, try by ID if it looks like an ID (fallback/compatibility)
  // But strict requirement was username URL. Let's stick to username.

  if (!users.length) {
    return notFound()
  }

  const profileUser = users[0]
  const isOwner = currentUser?.id === profileUser.id
  const publicTitles = Array.isArray(profileUser.titles)
    ? profileUser.titles.filter((title): title is string => typeof title === 'string').slice(0, 3)
    : []

  return (
    <div className="container max-w-2xl py-10">
      <Card>
        <CardHeader>
          <CardTitle>{dict?.settings?.profile || 'Profile'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Avatar Section */}
          <div className="flex flex-col items-center sm:flex-row sm:items-start gap-6">
            {isOwner ? (
              // Wrapper for AvatarUpload to match layout if needed, but the component handles itself well
              <div className="w-full">
                <AvatarUpload user={profileUser} dict={dict} />
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <Avatar user={profileUser} className="h-24 w-24 text-4xl" />
                <div>
                  <h2 className="text-2xl font-bold">{profileUser.username}</h2>
                  <p className="text-muted-foreground">
                    {profileUser.reputationPublicLabel || profileUser.trustLevel || 'Member'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {publicTitles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {publicTitles.map((title) => (
                <span
                  key={title}
                  className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium"
                >
                  {title}
                </span>
              ))}
            </div>
          )}

          {/* User Details */}
          <div className="grid gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span>
                {dict.settings?.joinDate || 'Member since'}{' '}
                {new Date(profileUser.createdAt).toLocaleDateString()}
              </span>
            </div>

            {isOwner && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>{profileUser.email}</span>
              </div>
            )}
          </div>

          {/* Settings Section (Owner Only) */}
          <ProfileSettings user={profileUser} currentUser={currentUser} dict={dict} lang={lang} />
        </CardContent>
      </Card>
    </div>
  )
}
