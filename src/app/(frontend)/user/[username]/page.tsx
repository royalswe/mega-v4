import React from 'react'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
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

  const payload = await getPayload({ config: configPromise })
  const { user: currentUser } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  // First try to find by username
  const { docs: users } = await payload.find({
    collection: 'users',
    where: {
      username: {
        equals: decodedUsername,
      },
    },
    depth: 2, // Ensure we get avatar details
  })

  // If not found by username, try by ID if it looks like an ID (fallback/compatibility)
  // But strict requirement was username URL. Let's stick to username.

  if (!users.length) {
    return notFound()
  }

  const profileUser = users[0]
  const isOwner = currentUser?.id === profileUser.id

  return (
    <div className="container max-w-2xl py-10">
      <Card>
        <CardHeader>
          <CardTitle>{dict.menu.profile || 'Profile'}</CardTitle>
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
                  <p className="text-muted-foreground">{dict.profile?.member || 'Member'}</p>
                </div>
              </div>
            )}
          </div>

          {/* User Details */}
          <div className="grid gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span>
                {dict.profile?.joined || 'Joined'}{' '}
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
          <ProfileSettings user={profileUser} currentUser={currentUser} dict={dict} />
        </CardContent>
      </Card>
    </div>
  )
}
