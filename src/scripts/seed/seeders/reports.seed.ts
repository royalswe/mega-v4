import type { Payload } from 'payload'
import { faker } from '@faker-js/faker'

import { chance, pickOne } from './utils.seed'

type ReportReason = 'spam' | 'abuse' | 'broken_link' | 'harassment' | 'nsfw' | 'other'
type ReportStatus = 'pending' | 'approved' | 'rejected'

const reasons: ReportReason[] = ['spam', 'abuse', 'broken_link', 'harassment', 'nsfw', 'other']

const pickStatus = (): ReportStatus => {
  if (chance(0.1)) return 'approved'
  if (chance(0.3)) return 'rejected'
  return 'pending'
}

export async function seedReports(payload: Payload) {
  const [{ docs: users }, { docs: posts }, { docs: comments }, { docs: links }] = await Promise.all(
    [
      payload.find({
        collection: 'users',
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'posts',
        limit: 400,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'comments',
        limit: 400,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'links',
        limit: 400,
        depth: 0,
        overrideAccess: true,
      }),
    ],
  )

  if (users.length === 0) {
    console.log('Skipping reports seed: no users available')
    return
  }

  const reviewerCandidates = users.filter((user) =>
    Array.isArray(user.roles)
      ? user.roles.some((role) => role === 'admin' || role === 'moderator' || role === 'editor')
      : false,
  )

  const availableTypes = [
    ...(posts.length > 0 ? (['post'] as const) : []),
    ...(comments.length > 0 ? (['comment'] as const) : []),
    ...(links.length > 0 ? (['link'] as const) : []),
    ...(users.length > 1 ? (['user'] as const) : []),
  ]

  if (availableTypes.length === 0) {
    console.log('Skipping reports seed: no reportable targets found')
    return
  }

  let created = 0

  for (let i = 0; i < 35; i += 1) {
    const reporter = pickOne(users)
    const targetType = pickOne([...availableTypes])
    const status = pickStatus()

    const reportData: {
      reporter: number
      targetType: 'post' | 'comment' | 'link' | 'user'
      targetId: string
      reason: ReportReason
      details?: string
      status: ReportStatus
      reviewedBy?: number
      fastTracked?: boolean
      targetPost?: number
      targetComment?: number
      targetLink?: number
      targetUser?: number
    } = {
      reporter: reporter.id,
      targetType,
      targetId: '',
      reason: pickOne(reasons),
      details: chance(0.7) ? faker.lorem.sentences({ min: 1, max: 2 }) : undefined,
      status,
      fastTracked: chance(0.25),
    }

    if (targetType === 'post') {
      const post = pickOne(posts)
      reportData.targetPost = post.id
      reportData.targetId = String(post.id)
    }

    if (targetType === 'comment') {
      const comment = pickOne(comments)
      reportData.targetComment = comment.id
      reportData.targetId = String(comment.id)
    }

    if (targetType === 'link') {
      const link = pickOne(links)
      reportData.targetLink = link.id
      reportData.targetId = String(link.id)
    }

    if (targetType === 'user') {
      const userTarget = pickOne(users.filter((candidate) => candidate.id !== reporter.id))
      reportData.targetUser = userTarget.id
      reportData.targetId = String(userTarget.id)
    }

    if (status !== 'pending' && reviewerCandidates.length > 0) {
      reportData.reviewedBy = pickOne(reviewerCandidates).id
    }

    await payload.create({
      collection: 'reports',
      data: reportData,
      overrideAccess: true,
    })

    created += 1
  }

  console.log(`Seeded reports: ${created}`)
}
