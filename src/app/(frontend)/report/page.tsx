import { notFound, redirect } from 'next/navigation'

import { ReportForm } from '@/components/reports/ReportForm'
import { getAuthenticatedUser } from '@/lib/auth'

type ReportTargetType = 'post' | 'comment' | 'link' | 'user'

const isReportTargetType = (value: string | undefined): value is ReportTargetType => {
  return value === 'post' || value === 'comment' || value === 'link' || value === 'user'
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string }>
}) {
  const { user } = await getAuthenticatedUser()

  if (!user) {
    redirect(`/login?error=${encodeURIComponent('You must be logged in to file a report')}`)
  }

  const params = await searchParams
  const type = params.type
  const targetId = Number(params.id)

  if (!isReportTargetType(type) || !Number.isInteger(targetId) || targetId <= 0) {
    return notFound()
  }

  return (
    <div className="py-10">
      <ReportForm targetType={type} targetId={targetId} />
    </div>
  )
}
