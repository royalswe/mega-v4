'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { toggleSubfeedMembership } from '@/app/actions/subfeeds'
import { Button } from '@/components/ui/button'

export function JoinSubfeedButton({
  subfeedId,
  isMember,
  disabled,
  labels,
}: {
  subfeedId: number
  isMember: boolean
  disabled?: boolean
  labels?: {
    join?: string
    leave?: string
    updating?: string
    joinedToast?: string
    leftToast?: string
    failedToast?: string
  }
}) {
  const [pending, startTransition] = useTransition()
  const [member, setMember] = useState(isMember)

  const copy = labels || {}

  const onToggle = () => {
    startTransition(async () => {
      try {
        const result = await toggleSubfeedMembership(subfeedId)
        setMember(result.joined)
        toast.success(
          result.joined ? copy.joinedToast || 'Joined subfeed' : copy.leftToast || 'Left subfeed',
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : copy.failedToast || 'Membership update failed'
        toast.error(message)
      }
    })
  }

  return (
    <Button
      variant={member ? 'outline' : 'default'}
      disabled={disabled || pending}
      onClick={onToggle}
    >
      {pending
        ? copy.updating || 'Updating...'
        : member
          ? copy.leave || 'Leave SubFeed'
          : copy.join || 'Join SubFeed'}
    </Button>
  )
}
