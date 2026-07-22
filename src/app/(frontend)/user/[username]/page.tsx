import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { Avatar } from '@/components/users/Avatar'
import { AvatarUpload } from '@/components/users/AvatarUpload'
import { ProfileSettings } from '@/components/users/ProfileSettings'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarDays, Mail, MessageSquare, Share2, FileText, MessageCircle } from 'lucide-react'
import { LinkCard } from '@/components/links/LinkCard'
import { PostCard } from '@/components/posts/PostCard'
import { RichTextDisplay } from '@/components/ui/RichTextDisplay'
import { Timestamp } from '@/components/ui/Timestamp'
import { PrivateChat } from '@/components/users/PrivateChat.client'
import { Inbox } from '@/components/users/Inbox.client'
import { resolveID } from '@/lib/community/userSignals'
import { getUserInteractions } from '@/app/(frontend)/data/getInteractions'
import { getPostInteractions } from '@/app/(frontend)/data/getPostInteractions'
import { checkRole } from '@/access/checkRole'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ username: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function UserProfilePage({ params, searchParams }: PageProps) {
  const { username } = await params
  const { tab } = await searchParams
  const activeTab = typeof tab === 'string' ? tab : 'links'

  const decodedUsername = decodeURIComponent(username)
  const { user: currentUser, payload } = await getAuthenticatedUser()
  const { dict, lang } = await getDictionary()
  const canQuickEditLinks = currentUser ? checkRole(['admin'], currentUser) : false

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

  if (!users.length) {
    return notFound()
  }

  const profileUser = users[0]
  const isOwner = currentUser?.id === profileUser.id
  const publicTitles = Array.isArray(profileUser.titles)
    ? profileUser.titles.filter((title): title is string => typeof title === 'string').slice(0, 3)
    : []
  const pointSummary = [
    { label: 'TMV', value: profileUser.totalMemberValue ?? 0 },
    { label: 'Discovery', value: profileUser.discoveryScore ?? 0 },
    { label: 'Contribution', value: profileUser.contributionScore ?? 0 },
    { label: 'Likability', value: profileUser.likabilityScore ?? 0 },
    { label: 'Interaction', value: profileUser.interactionScore ?? 0 },
    { label: 'Cleaning', value: profileUser.cleaningScore ?? 0 },
    { label: 'Recruiter', value: profileUser.recruiterScore ?? 0 },
    { label: 'Security', value: profileUser.securityScore ?? 0 },
  ]

  // Fetch contributions of this user
  const [linksRes, postsRes, commentsRes] = await Promise.all([
    payload.find({
      collection: 'links',
      where: {
        user: { equals: profileUser.id },
      },
      sort: '-createdAt',
      limit: 30,
      ...withAccess,
    }),
    payload.find({
      collection: 'posts',
      where: {
        user: { equals: profileUser.id },
      },
      sort: '-createdAt',
      limit: 30,
      ...withAccess,
    }),
    payload.find({
      collection: 'comments',
      where: {
        user: { equals: profileUser.id },
      },
      sort: '-createdAt',
      limit: 30,
      depth: 2,
      ...withAccess,
    }),
  ])

  const userLinks = linksRes.docs
  const userPosts = postsRes.docs
  const userComments = commentsRes.docs

  // Fetch interactions for LinkCards and PostCards
  const linkIds = userLinks.map((l) => l.id)
  const postIds = userPosts.map((p) => p.id)

  const [linkInteractions, postInteractions] = await Promise.all([
    getUserInteractions(currentUser, linkIds),
    getPostInteractions(currentUser, postIds),
  ])

  let quickEditSubfeeds: Array<{ id: number; name: string }> = []
  if (currentUser && canQuickEditLinks) {
    const { docs: subfeedsForEdit } = await payload.find({
      collection: 'subfeeds',
      sort: 'name',
      depth: 0,
      limit: 200,
      user: currentUser,
      overrideAccess: false,
    })

    quickEditSubfeeds = subfeedsForEdit.map((subfeedForEdit) => ({
      id: subfeedForEdit.id,
      name: subfeedForEdit.name,
    }))
  }

  // Handle messages logic
  let conversations: any[] = []
  let pmHistory: any[] = []

  if (currentUser) {
    if (isOwner) {
      // Fetch all messages involving currentUser to build the Inbox
      const { docs: allMsgs } = await payload.find({
        collection: 'private-messages',
        where: {
          or: [{ sender: { equals: currentUser.id } }, { receiver: { equals: currentUser.id } }],
        },
        sort: '-createdAt',
        limit: 200,
        depth: 2,
        ...withAccess,
      })

      const conversationsMap = new Map<number, any>()

      for (const msg of allMsgs) {
        const senderId = resolveID(msg.sender)
        const receiverId = resolveID(msg.receiver)
        if (!senderId || !receiverId) continue

        const isSenderMe = senderId === currentUser.id
        const partner = isSenderMe ? msg.receiver : msg.sender
        if (!partner || typeof partner !== 'object') continue

        const partnerId = partner.id
        const existing = conversationsMap.get(partnerId)

        const isUnread = !msg.isRead && !isSenderMe

        if (!existing) {
          conversationsMap.set(partnerId, {
            partner,
            lastMessage: msg,
            unreadCount: isUnread ? 1 : 0,
          })
        } else {
          if (isUnread) {
            existing.unreadCount += 1
          }
        }
      }

      conversations = Array.from(conversationsMap.values()).sort(
        (a, b) =>
          new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime(),
      )
    } else {
      // Fetch private message thread between currentUser and profileUser
      const { docs: history } = await payload.find({
        collection: 'private-messages',
        where: {
          or: [
            {
              and: [
                { sender: { equals: currentUser.id } },
                { receiver: { equals: profileUser.id } },
              ],
            },
            {
              and: [
                { sender: { equals: profileUser.id } },
                { receiver: { equals: currentUser.id } },
              ],
            },
          ],
        },
        sort: 'createdAt',
        limit: 100,
        depth: 2,
        ...withAccess,
      })
      pmHistory = history
    }
  }

  // Calculate total unread count for the owner's profile tab badge
  const totalUnreadCount = conversations.reduce((acc, conv) => acc + conv.unreadCount, 0)

  return (
    <div className="container max-w-4xl py-10 px-4 space-y-8">
      {/* Top Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle>{dict?.settings?.profile || 'Profile'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Avatar Section */}
          <div className="flex flex-col items-center sm:flex-row sm:items-start gap-6">
            {isOwner ? (
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

          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Member Value</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold">{pointSummary[0].value.toLocaleString()}</span>
                <span className="text-sm text-muted-foreground">TMV</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {pointSummary.slice(1).map((pointClass) => (
                  <div key={pointClass.label} className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {pointClass.label}
                    </div>
                    <div className="mt-1 text-xl font-semibold">
                      {pointClass.value.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

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

      {/* Tabs Section */}
      <div className="space-y-6">
        <div className="flex flex-wrap border-b gap-1">
          <Link
            href={`/user/${encodeURIComponent(profileUser.username)}?tab=links`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-0.5 transition-colors flex items-center gap-2 ${
              activeTab === 'links'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Share2 className="h-4 w-4" />
            Submitted Links ({userLinks.length})
          </Link>
          <Link
            href={`/user/${encodeURIComponent(profileUser.username)}?tab=posts`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-0.5 transition-colors flex items-center gap-2 ${
              activeTab === 'posts'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="h-4 w-4" />
            Posts ({userPosts.length})
          </Link>
          <Link
            href={`/user/${encodeURIComponent(profileUser.username)}?tab=comments`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-0.5 transition-colors flex items-center gap-2 ${
              activeTab === 'comments'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            Comments ({userComments.length})
          </Link>
          {currentUser && (
            <Link
              href={`/user/${encodeURIComponent(profileUser.username)}?tab=messages`}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-0.5 transition-colors flex items-center gap-2 ${
                activeTab === 'messages'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              {isOwner ? 'Inbox' : 'Messages'}
              {isOwner && totalUnreadCount > 0 && (
                <span className="h-4 min-w-4 px-1 flex items-center justify-center rounded-full bg-green-500 text-[8px] font-bold text-white">
                  {totalUnreadCount}
                </span>
              )}
            </Link>
          )}
        </div>

        {/* Tab content panel */}
        <div>
          {activeTab === 'links' && (
            <div className="space-y-4">
              {userLinks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border rounded-lg bg-card text-sm">
                  No links submitted yet.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {userLinks.map((link) => (
                    <LinkCard
                      key={link.id}
                      link={link}
                      userId={currentUser?.id}
                      userVote={linkInteractions.votes[link.id]}
                      isBookmarked={linkInteractions.bookmarks[link.id]}
                      quickEditEnabled={canQuickEditLinks}
                      quickEditSubfeeds={quickEditSubfeeds}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'posts' && (
            <div className="space-y-4">
              {userPosts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border rounded-lg bg-card text-sm">
                  No posts created yet.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {userPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      userId={currentUser?.id}
                      userVote={postInteractions.votes[post.id]}
                      isBookmarked={postInteractions.bookmarks[post.id]}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="space-y-4">
              {userComments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border rounded-lg bg-card text-sm">
                  No comments made yet.
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {userComments.map((comment) => {
                    const targetLink = typeof comment.link === 'object' ? comment.link : null
                    const targetPost = typeof comment.post === 'object' ? comment.post : null
                    const targetTitle = targetLink
                      ? targetLink.title
                      : targetPost
                        ? targetPost.title
                        : 'Deleted Content'
                    const targetHref = targetLink
                      ? `/link/${targetLink.id}`
                      : targetPost
                        ? `/post/${targetPost.id}`
                        : '#'

                    return (
                      <Card
                        key={comment.id}
                        className="py-0 border hover:border-primary/20 transition-colors"
                      >
                        <CardContent className="px-4 py-2 space-y-2">
                          <div className="text-xs text-muted-foreground">
                            Commented on{' '}
                            <Link
                              href={targetHref}
                              className="font-semibold text-foreground hover:underline"
                            >
                              {targetTitle}
                            </Link>{' '}
                            &bull; <Timestamp date={comment.createdAt} />
                          </div>
                          <div className="text-sm">
                            <RichTextDisplay content={comment.comment} />
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'messages' && currentUser && (
            <div>
              {isOwner ? (
                <Inbox conversations={conversations} />
              ) : (
                <PrivateChat
                  profileUser={{
                    id: profileUser.id,
                    username: profileUser.username,
                    reputationPublicLabel: profileUser.reputationPublicLabel,
                  }}
                  currentUser={{
                    id: currentUser.id,
                    username: currentUser.username,
                  }}
                  initialMessages={pmHistory}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
