'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import {
  assignSubfeedRole,
  removeSubfeedMember,
  removeSubfeedRole,
} from '@/app/actions/subfeeds'
import type { SubfeedLocalRole } from '@/app/actions/subfeeds'
import { Button } from '@/components/ui/button'

export interface RosterUser {
  id: number
  username: string
}

export interface SubfeedRosterLabels {
  title: string
  subtitle: string
  owner: string
  moderator: string
  editor: string
  uploader: string
  members: string
  manageHint: string
  readOnlyHint: string
  empty: string
  makeModerator: string
  makeEditor: string
  makeUploader: string
  revoke: string
  remove: string
  assignError: string
  revokeError: string
  removeError: string
  you: string
}

interface Props {
  subfeedId: number
  canManage: boolean
  owner: RosterUser | null
  moderators: RosterUser[]
  editors: RosterUser[]
  uploaders: RosterUser[]
  members: RosterUser[]
  currentUserId?: number
  labels: SubfeedRosterLabels
}

export function SubfeedRoster({
  subfeedId,
  canManage,
  owner,
  moderators,
  editors,
  uploaders,
  members,
  currentUserId,
  labels,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const ownerId = owner?.id ?? null
  const moderatorIds = new Set(moderators.map((m) => m.id))
  const editorIds = new Set(editors.map((m) => m.id))
  const uploaderIds = new Set(uploaders.map((m) => m.id))

  const roster = new Map<number, RosterUser>()
  for (const user of [...(owner ? [owner] : []), ...moderators, ...editors, ...uploaders, ...members]) {
    if (!roster.has(user.id)) roster.set(user.id, user)
  }

  const roleBadge = (role: 'owner' | SubfeedLocalRole) => {
    const text =
      role === 'owner'
        ? labels.owner
        : role === 'moderator'
          ? labels.moderator
          : role === 'editor'
            ? labels.editor
            : labels.uploader

    return (
      <span className="inline-flex items-center rounded-full border bg-muted px-2 py-0.5 text-xs font-medium">
        {text}
      </span>
    )
  }

  const rolesFor = (userId: number): Array<'owner' | SubfeedLocalRole> => {
    const roles: Array<'owner' | SubfeedLocalRole> = []
    if (userId === ownerId) roles.push('owner')
    if (moderatorIds.has(userId)) roles.push('moderator')
    if (editorIds.has(userId)) roles.push('editor')
    if (uploaderIds.has(userId)) roles.push('uploader')
    return roles
  }

  const run = (fn: () => Promise<void>, errorLabel: string) => {
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (error) {
        const message = error instanceof Error ? error.message : errorLabel
        toast.error(message)
      }
    })
  }

  const assign = (userId: number, role: SubfeedLocalRole) =>
    run(() => assignSubfeedRole(subfeedId, userId, role), labels.assignError)

  const revoke = (userId: number, role: SubfeedLocalRole) =>
    run(() => removeSubfeedRole(subfeedId, userId, role), labels.revokeError)

  const remove = (userId: number) =>
    run(() => removeSubfeedMember(subfeedId, userId), labels.removeError)

  return (
    <section className="rounded-md border p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{labels.title}</h2>
        <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
        <p className="text-sm text-muted-foreground">
          {canManage ? labels.manageHint : labels.readOnlyHint}
        </p>
      </div>

      {roster.size === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="mt-4 divide-y">
          {Array.from(roster.values()).map((user) => {
            const roles = rolesFor(user.id)
            const isOwner = user.id === ownerId
            const missingRoles = (['moderator', 'editor', 'uploader'] as SubfeedLocalRole[]).filter(
              (role) => !roles.includes(role),
            )

            return (
              <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{user.username}</span>
                  {user.id === currentUserId ? (
                    <span className="text-xs text-muted-foreground">{labels.you}</span>
                  ) : null}
                  <span className="flex flex-wrap gap-1">
                    {roles.map((role) => (
                      <span key={role}>{roleBadge(role)}</span>
                    ))}
                  </span>
                </div>

                {canManage && !isOwner ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {missingRoles.map((role) => (
                      <Button
                        key={role}
                        variant="outline"
                        size="xs"
                        disabled={pending}
                        onClick={() => assign(user.id, role)}
                      >
                        {role === 'moderator'
                          ? labels.makeModerator
                          : role === 'editor'
                            ? labels.makeEditor
                            : labels.makeUploader}
                      </Button>
                    ))}
                    {roles.some((role) => role !== 'owner') ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={pending}
                        onClick={() => {
                          const revocable = (['uploader', 'editor', 'moderator'] as SubfeedLocalRole[]).find(
                            (role) => roles.includes(role),
                          )
                          if (revocable) revoke(user.id, revocable)
                        }}
                      >
                        {labels.revoke}
                      </Button>
                    ) : null}
                    <Button
                      variant="destructive"
                      size="xs"
                      disabled={pending}
                      onClick={() => remove(user.id)}
                    >
                      {labels.remove}
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
