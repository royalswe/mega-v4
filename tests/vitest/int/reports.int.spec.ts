import { Payload } from 'payload'
import { describe, it, beforeAll, expect } from 'vitest'

import { getTestPayload } from '../utils/test-user'
import { createFeedItem, createMember, type Member } from './helpers'

/**
 * Report resolution is a state machine over the reported content: a trusted
 * reporter hides it immediately, a review approves the removal, and a rejection
 * puts it back. None of that was covered before.
 */

let payload: Payload

const readLink = (id: number) =>
  payload.findByID({ collection: 'links', id, depth: 0, overrideAccess: true })

/**
 * `reporter`, `targetId` and `fastTracked` are all derived by the collection's
 * `beforeValidate` hook, so the create payload deliberately omits them and Payload's
 * generated types have to be told that once, here.
 */
const createReport = async (reporter: Member, linkId: number, reason: string) =>
  payload.create({
    collection: 'reports',
    data: { targetType: 'link', targetLink: linkId, reason } as never,
    user: reporter,
    draft: false,
    overrideAccess: false,
  })

describe('Report resolution', () => {
  beforeAll(async () => {
    payload = await getTestPayload()
  })

  it('leaves the target alone for an untrusted reporter and hides it on approval', async () => {
    const reporter = await createMember(payload)
    const reviewer = await createMember(payload, { roles: ['admin', 'user'] })
    const link = await createFeedItem(payload, {
      collection: 'links',
      user: reporter.id,
      feed: 'main',
      state: 'published',
    })

    const report = await createReport(reporter, link.id, 'spam')

    expect(report.fastTracked).toBe(false)
    expect(report.targetId).toBe(String(link.id))
    expect((await readLink(link.id)).softDeleted).toBe(false)

    await payload.update({
      collection: 'reports',
      id: report.id,
      data: { status: 'approved', reviewedBy: reviewer.id },
      user: reviewer,
      overrideAccess: false,
    })

    expect((await readLink(link.id)).softDeleted).toBe(true)
  })

  it('hides the target immediately for a trusted reporter', async () => {
    // Admins are exempt from automatic role demotion, so this is the stable way
    // to express "trusted reporter" without depending on the trust ladder.
    const reporter = await createMember(payload, { roles: ['admin', 'user'] })
    const link = await createFeedItem(payload, {
      collection: 'links',
      user: reporter.id,
      feed: 'main',
      state: 'published',
    })

    const report = await createReport(reporter, link.id, 'abuse')

    expect(report.fastTracked).toBe(true)
    expect((await readLink(link.id)).softDeleted).toBe(true)
  })

  it('restores the target when a report is rejected', async () => {
    const reporter = await createMember(payload)
    const reviewer = await createMember(payload, { roles: ['admin', 'user'] })
    const link = await createFeedItem(payload, {
      collection: 'links',
      user: reporter.id,
      feed: 'main',
      state: 'published',
    })

    const report = await createReport(reporter, link.id, 'other')

    await payload.update({
      collection: 'reports',
      id: report.id,
      data: { status: 'approved', reviewedBy: reviewer.id },
      user: reviewer,
      overrideAccess: false,
    })
    expect((await readLink(link.id)).softDeleted).toBe(true)

    await payload.update({
      collection: 'reports',
      id: report.id,
      data: { status: 'rejected', reviewedBy: reviewer.id },
      user: reviewer,
      overrideAccess: false,
    })
    expect((await readLink(link.id)).softDeleted).toBe(false)
  })

  it('does not let a member review their own report', async () => {
    const reporter = await createMember(payload)
    const link = await createFeedItem(payload, {
      collection: 'links',
      user: reporter.id,
      feed: 'main',
      state: 'published',
    })

    const report = await createReport(reporter, link.id, 'spam')

    await expect(
      payload.update({
        collection: 'reports',
        id: report.id,
        data: { status: 'approved' },
        user: reporter,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })
})
