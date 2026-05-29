'use server'

import { revalidatePath } from 'next/cache'
import type { RequiredDataFromCollectionSlug } from 'payload'

import { getAuthenticatedUser } from '@/lib/auth'

type ReportTargetType = 'post' | 'comment' | 'link' | 'user'
type ReportReason = 'spam' | 'abuse' | 'broken_link' | 'harassment' | 'nsfw' | 'other'
type ReportDecision = 'approved' | 'rejected'

const canReviewReports = (roles: unknown): boolean => {
  if (!Array.isArray(roles)) return false

  return roles.some((role) => role === 'admin' || role === 'moderator' || role === 'editor')
}

export async function submitReport(input: {
  targetType: ReportTargetType
  targetId: number
  reason: ReportReason
  details?: string
}) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to report content')
  }

  if (!Number.isInteger(input.targetId) || input.targetId <= 0) {
    throw new Error('Invalid report target')
  }

  const details = input.details?.trim()
  if (details && details.length > 1200) {
    throw new Error('Report details are too long')
  }

  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  const { docs: existingReports } = await payload.find({
    collection: 'reports',
    where: {
      and: [
        {
          reporter: {
            equals: user.id,
          },
        },
        {
          targetType: {
            equals: input.targetType,
          },
        },
        {
          targetId: {
            equals: String(input.targetId),
          },
        },
        {
          status: {
            equals: 'pending',
          },
        },
      ],
    },
    limit: 1,
    depth: 0,
    ...withAccess,
  })

  if (existingReports.length > 0) {
    throw new Error('You already have a pending report for this target')
  }

  const targetData: {
    targetPost?: number
    targetComment?: number
    targetLink?: number
    targetUser?: number
  } = {}

  if (input.targetType === 'post') targetData.targetPost = input.targetId
  if (input.targetType === 'comment') targetData.targetComment = input.targetId
  if (input.targetType === 'link') targetData.targetLink = input.targetId
  if (input.targetType === 'user') targetData.targetUser = input.targetId

  const reportData: RequiredDataFromCollectionSlug<'reports'> = {
    reporter: user.id,
    targetType: input.targetType,
    targetId: String(input.targetId),
    reason: input.reason,
    status: 'pending',
    details: details || undefined,
    ...targetData,
  }

  const report = await payload.create({
    collection: 'reports',
    data: reportData,
    ...withAccess,
  })

  revalidatePath('/moderation')

  return {
    id: report.id,
    status: report.status,
  }
}

export async function reviewReport(reportId: number, decision: ReportDecision) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to review reports')
  }

  if (!canReviewReports(user.roles)) {
    throw new Error('You do not have permission to review reports')
  }

  const withAccess = {
    user,
    overrideAccess: false as const,
  }

  const report = await payload.update({
    collection: 'reports',
    id: reportId,
    data: {
      status: decision,
      reviewedBy: user.id,
    },
    ...withAccess,
  })

  revalidatePath('/moderation')

  if (report.targetType === 'post' && report.targetPost) {
    const postId = typeof report.targetPost === 'number' ? report.targetPost : report.targetPost.id
    revalidatePath(`/post/${postId}`)
    revalidatePath('/wall')
  }

  if (report.targetType === 'link' && report.targetLink) {
    const linkId = typeof report.targetLink === 'number' ? report.targetLink : report.targetLink.id
    revalidatePath(`/link/${linkId}`)
    revalidatePath('/')
  }
}
