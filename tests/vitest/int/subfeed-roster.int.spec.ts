// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { removeSubfeedRole } from '@/app/actions/subfeeds'
import { SubfeedRoster } from '@/components/subfeeds/SubfeedRoster'
import type { SubfeedRosterLabels } from '@/components/subfeeds/SubfeedRoster'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/actions/subfeeds', () => ({
  assignSubfeedRole: vi.fn(),
  removeSubfeedMember: vi.fn(),
  removeSubfeedRole: vi.fn().mockResolvedValue(undefined),
}))

const labels: SubfeedRosterLabels = {
  title: 'Roster',
  subtitle: '',
  owner: 'Owner',
  moderator: 'Moderator',
  editor: 'Editor',
  uploader: 'Uploader',
  members: 'Members',
  manageHint: '',
  readOnlyHint: '',
  empty: 'Empty',
  makeModerator: 'Make moderator',
  makeEditor: 'Make editor',
  makeUploader: 'Make uploader',
  revoke: 'Revoke',
  remove: 'Remove',
  assignError: 'Assignment failed',
  revokeError: 'Revocation failed',
  removeError: 'Removal failed',
  you: 'You',
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Subfeed roster revocation', () => {
  it('renders separate role-specific controls and never offers to revoke an owner', async () => {
    const owner = { id: 1, username: 'owner-user' }
    const member = { id: 2, username: 'member-user' }
    render(
      createElement(SubfeedRoster, {
        subfeedId: 3,
        canManage: true,
        owner,
        moderators: [owner, member],
        editors: [owner, member],
        uploaders: [owner, member],
        members: [owner, member],
        labels,
      }),
    )

    expect(screen.getByText('owner-user').closest('li')?.querySelectorAll('button')).toHaveLength(0)
    for (const role of ['moderator', 'editor', 'uploader'] as const) {
      fireEvent.click(screen.getByRole('button', { name: `Revoke ${labels[role]}` }))
      await waitFor(() => {
        expect(removeSubfeedRole).toHaveBeenLastCalledWith(3, member.id, role)
        expect(
          screen.getByRole('button', { name: `Revoke ${labels[role]}` }).hasAttribute('disabled'),
        ).toBe(false)
      })
    }
    expect(removeSubfeedRole).toHaveBeenCalledTimes(3)
  })
})
