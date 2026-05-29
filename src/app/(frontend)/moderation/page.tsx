export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ModerationActionButtons } from '@/components/reports/ModerationActionButtons'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { checkRole } from '@/access/checkRole'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import type { Report, User } from '@/payload-types'

const readRelationshipId = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'number') {
    return value.id
  }
  return null
}

const isUserRelationship = (value: number | User | null | undefined): value is User => {
  return Boolean(value && typeof value === 'object')
}

const getTargetHref = (report: Report): string | null => {
  if (report.targetType === 'post') {
    const postId = readRelationshipId(report.targetPost)
    return postId ? `/post/${postId}` : null
  }

  if (report.targetType === 'link') {
    const linkId = readRelationshipId(report.targetLink)
    return linkId ? `/link/${linkId}` : null
  }

  if (report.targetType === 'comment') {
    const comment = report.targetComment
    if (comment && typeof comment === 'object') {
      const postId = readRelationshipId(comment.post)
      if (postId) return `/post/${postId}`

      const linkId = readRelationshipId(comment.link)
      if (linkId) return `/link/${linkId}`
    }

    return null
  }

  if (report.targetType === 'user') {
    if (isUserRelationship(report.targetUser) && report.targetUser.username) {
      return `/user/${report.targetUser.username}`
    }
  }

  return null
}

export default async function ModerationPage() {
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  if (!user) {
    redirect('/login')
  }

  if (!checkRole(['admin', 'moderator', 'editor'], user)) {
    redirect('/')
  }

  const { docs: reports } = await payload.find({
    collection: 'reports',
    where: {
      status: {
        equals: 'pending',
      },
    },
    sort: '-fastTracked,-createdAt',
    limit: 100,
    depth: 2,
    user,
    overrideAccess: false,
  })

  const moderationDict = dict.moderationPage

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{moderationDict.title}</h1>
        <p className="text-muted-foreground">{moderationDict.subtitle}</p>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {moderationDict.emptyState}
          </CardContent>
        </Card>
      ) : (
        reports.map((report) => {
          const href = getTargetHref(report)
          const reasonLabel = moderationDict.reasons[report.reason] || report.reason
          const targetTypeLabel = moderationDict.targetTypes[report.targetType] || report.targetType
          const reporter = isUserRelationship(report.reporter)
            ? report.reporter.username || report.reporter.email
            : `${moderationDict.reporterFallbackPrefix}${report.reporter}`

          return (
            <Card key={report.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {reasonLabel} • {targetTypeLabel} #{report.targetId}
                    </CardTitle>
                    <CardDescription>
                      {moderationDict.reportedBy} {reporter}
                      {report.fastTracked ? ` • ${moderationDict.fastTracked}` : ''}
                    </CardDescription>
                  </div>
                  <ModerationActionButtons reportId={report.id} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {report.details ? <p className="whitespace-pre-wrap">{report.details}</p> : null}

                {href ? (
                  <Link href={href} className="text-primary hover:underline">
                    {moderationDict.openTargetContent}
                  </Link>
                ) : (
                  <p className="text-muted-foreground">{moderationDict.targetUnavailable}</p>
                )}
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
