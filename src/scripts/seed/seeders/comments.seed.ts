import type { Payload } from 'payload'
import type { Comment } from '@/payload-types'

import {
  SEED_INTERACTION_SCENARIOS,
  asLexicalRichText,
  createSeedTally,
  offsetIsoFromReference,
  readRelationId,
  type SeedStepTally,
  type SeededContentIndex,
} from './utils.seed'
import { requirePersona } from './links.seed'
import type { SeedUsers } from './users.seed'

export interface SeedCommentsResult {
  tally: SeedStepTally
  ids: Map<string, number>
}

const lexicalText = (value: unknown): string => {
  const root = (value as { root?: { children?: unknown[] } } | null)?.root
  if (!root || !Array.isArray(root.children)) return ''

  const paragraphs: string[] = []

  for (const node of root.children) {
    const children = (node as { children?: unknown[] } | null)?.children
    if (!Array.isArray(children)) continue

    const text = children
      .map((child) => (child as { text?: unknown } | null)?.text)
      .filter((part): part is string => typeof part === 'string')
      .join('')

    if (text) paragraphs.push(text)
  }

  return paragraphs.join('\n\n')
}

const commentKey = ({
  kind,
  targetId,
  userId,
  text,
}: {
  kind: 'link' | 'post'
  targetId: number
  userId: number
  text: string
}) => `${kind}:${targetId}:${userId}:${text}`

const seededCommentScenarios = SEED_INTERACTION_SCENARIOS.filter(
  (scenario) => scenario.kind === 'comment',
)

/**
 * Creates or reconciles the authored comment scenarios. Natural key:
 * `(target kind, target id, author id, comment text)`. Replies resolve their
 * parent through the comment scenario key on the same target.
 */
export async function seedComments(
  payload: Payload,
  users: SeedUsers,
  content: SeededContentIndex,
  referenceNow: Date,
): Promise<SeedCommentsResult> {
  const tally = createSeedTally('comments')
  const ids = new Map<string, number>()
  const linkIds = [...content.values()].filter((entry) => entry.kind === 'link').map((e) => e.id)
  const postIds = [...content.values()].filter((entry) => entry.kind === 'post').map((e) => e.id)

  const { docs: existingComments } = await payload.find({
    collection: 'comments',
    where: {
      or: [
        ...(linkIds.length > 0 ? [{ link: { in: linkIds } }] : []),
        ...(postIds.length > 0 ? [{ post: { in: postIds } }] : []),
      ],
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  const existingByKey = new Map<string, Comment>()

  for (const comment of existingComments) {
    const targetId = readRelationId(comment.link) ?? readRelationId(comment.post)
    const userId = readRelationId(comment.user)
    const kind = comment.link ? 'link' : comment.post ? 'post' : null

    if (!targetId || !userId || !kind) continue

    existingByKey.set(
      commentKey({ kind, targetId, userId, text: lexicalText(comment.comment) }),
      comment,
    )
  }

  for (const scenario of seededCommentScenarios) {
    const actor = requirePersona(users, scenario.actor)
    const target = content.get(scenario.target)

    if (!target) {
      throw new Error(
        `Seed comment "${scenario.key}" targets unknown content scenario "${scenario.target}".`,
      )
    }

    if (!scenario.text) {
      throw new Error(`Seed comment "${scenario.key}" has no authored text.`)
    }

    const parentComment = scenario.parentKey ? ids.get(scenario.parentKey) : undefined

    if (scenario.parentKey && !parentComment) {
      throw new Error(
        `Seed comment "${scenario.key}" replies to "${scenario.parentKey}", which has not been seeded on the same target.`,
      )
    }

    const key = commentKey({
      kind: target.kind,
      targetId: target.id,
      userId: actor.id,
      text: scenario.text,
    })
    const existing = existingByKey.get(key)
    const data = {
      user: actor.id,
      link: target.kind === 'link' ? target.id : undefined,
      post: target.kind === 'post' ? target.id : undefined,
      parentComment,
      comment: asLexicalRichText(scenario.text),
      moderationStatus: 'visible' as const,
    }

    if (existing) {
      const parentChanged = readRelationId(existing.parentComment) !== (parentComment ?? null)
      const moderationChanged = existing.moderationStatus !== 'visible'

      if (parentChanged || moderationChanged) {
        const updated = await payload.update({
          collection: 'comments',
          id: existing.id,
          data,
          user: moderationChanged ? requirePersona(users, 'kalle') : actor,
          overrideAccess: false,
          depth: 0,
        })

        const persisted = await payload.findByID({
          collection: 'comments',
          id: updated.id,
          depth: 0,
          overrideAccess: true,
        })

        if (persisted.moderationStatus !== 'visible') {
          throw new Error(`Seed comment "${scenario.key}" was not restored to visible.`)
        }

        ids.set(scenario.key, persisted.id)
        tally.reconciled += 1
      } else {
        ids.set(scenario.key, existing.id)
        tally.skipped += 1
      }

      continue
    }

    const createdAt = offsetIsoFromReference(referenceNow, scenario.referenceNowOffsetHours)
    const created = await payload.create({
      collection: 'comments',
      data: {
        ...data,
        createdAt,
        updatedAt: createdAt,
      },
      user: actor,
      overrideAccess: false,
      depth: 0,
    })

    ids.set(scenario.key, created.id)
    tally.created += 1
  }

  return { tally, ids }
}
