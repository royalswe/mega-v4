import type { Payload } from 'payload'
import type { Report } from '@/payload-types'

import {
  SEED_INTERACTION_SCENARIOS,
  createSeedTally,
  offsetIsoFromReference,
  readRelationId,
  type SeedStepTally,
  type SeededContentIndex,
} from './utils.seed'
import { requirePersona } from './links.seed'
import type { SeedUsers } from './users.seed'

export type ReportTargetType = 'post' | 'comment' | 'link' | 'user'

const reportKey = ({
  reporterId,
  targetType,
  targetId,
  reason,
}: {
  reporterId: number
  targetType: string
  targetId: string
  reason: string
}) => `${reporterId}:${targetType}:${targetId}:${reason}`

const resolveReportTarget = (
  report: Report,
): { targetType: ReportTargetType; targetId: string } => {
  if (report.targetPost) {
    return { targetType: 'post', targetId: String(readRelationId(report.targetPost)) }
  }

  if (report.targetComment) {
    return { targetType: 'comment', targetId: String(readRelationId(report.targetComment)) }
  }

  if (report.targetLink) {
    return { targetType: 'link', targetId: String(readRelationId(report.targetLink)) }
  }

  return { targetType: 'user', targetId: String(readRelationId(report.targetUser)) }
}

/**
 * Creates the authored moderation reports. Reports are append-only scenario
 * records, so an existing row is skipped rather than rewritten (rewriting a
 * reporter's account would change the moderation narrative).
 */
export async function seedReports(
  payload: Payload,
  users: SeedUsers,
  content: SeededContentIndex,
  referenceNow: Date,
): Promise<SeedStepTally> {
  const tally = createSeedTally('reports')
  const scenarios = SEED_INTERACTION_SCENARIOS.filter((scenario) => scenario.kind === 'report')

  const { docs: existingReports } = await payload.find({
    collection: 'reports',
    limit: 10_000,
    depth: 0,
    overrideAccess: true,
  })

  const seen = new Set<string>()

  for (const report of existingReports) {
    const reporterId = readRelationId(report.reporter)
    if (!reporterId) continue

    const target = resolveReportTarget(report)
    seen.add(
      reportKey({
        reporterId,
        targetType: target.targetType,
        targetId: target.targetId,
        reason: report.reason,
      }),
    )
  }

  for (const scenario of scenarios) {
    const actor = requirePersona(users, scenario.actor)
    const target = content.get(scenario.target)

    if (!target) {
      throw new Error(
        `Seed report "${scenario.key}" targets unknown content scenario "${scenario.target}".`,
      )
    }

    if (!scenario.reason) {
      throw new Error(`Seed report "${scenario.key}" has no reason.`)
    }

    const key = reportKey({
      reporterId: actor.id,
      targetType: target.kind,
      targetId: String(target.id),
      reason: scenario.reason,
    })

    if (seen.has(key)) {
      tally.skipped += 1
      continue
    }

    const createdAt = offsetIsoFromReference(referenceNow, scenario.referenceNowOffsetHours)
    await payload.create({
      collection: 'reports',
      data: {
        reporter: actor.id,
        targetType: target.kind,
        targetId: String(target.id),
        targetLink: target.kind === 'link' ? target.id : undefined,
        targetPost: target.kind === 'post' ? target.id : undefined,
        reason: scenario.reason,
        details: scenario.details,
        status: 'pending',
        createdAt,
        updatedAt: createdAt,
      },
      user: actor,
      overrideAccess: false,
      depth: 0,
    })

    seen.add(key)
    tally.created += 1
  }

  return tally
}
