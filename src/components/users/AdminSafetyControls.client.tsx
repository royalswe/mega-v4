'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Unlock, RotateCcw, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { rollbackUserRoles, setStandingLock } from '@/app/actions/users'

interface AdminSafetyControlsProps {
  userId: number
  username: string
  standingLocked?: boolean | null
  earnedRoleCount?: number
}

export function AdminSafetyControls({
  userId,
  username,
  standingLocked = false,
  earnedRoleCount = 0,
}: AdminSafetyControlsProps) {
  const router = useRouter()
  const [locked, setLocked] = useState(Boolean(standingLocked))
  const [loading, setLoading] = useState(false)

  const handleToggleLock = async () => {
    setLoading(true)
    try {
      const next = !locked
      await setStandingLock(userId, next)
      setLocked(next)
      toast.success(next ? 'Standing progression frozen' : 'Standing progression unfrozen')
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error('Failed to update standing lock')
    } finally {
      setLoading(false)
    }
  }

  const handleRollbackRoles = async () => {
    if (!confirm(`Are you sure you want to rollback all automatically earned roles for @${username}?`)) {
      return
    }
    setLoading(true)
    try {
      await rollbackUserRoles(userId, { lockStanding: true })
      setLocked(true)
      toast.success('Earned roles revoked and standing progression frozen')
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error('Failed to rollback earned roles')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border rounded-lg bg-card text-xs">
      <div className="flex items-center gap-1 font-semibold text-muted-foreground mr-2">
        <ShieldAlert className="h-4 w-4 text-amber-500" />
        <span>Admin Standing & Role Safety Controls:</span>
      </div>
      <Button
        type="button"
        size="xs"
        variant={locked ? 'destructive' : 'outline'}
        onClick={handleToggleLock}
        disabled={loading}
      >
        {locked ? (
          <>
            <Lock className="h-3.5 w-3.5 mr-1" />
            Standing Frozen (Click to Unlock)
          </>
        ) : (
          <>
            <Unlock className="h-3.5 w-3.5 mr-1" />
            Freeze Standing
          </>
        )}
      </Button>
      {earnedRoleCount > 0 ? (
        <Button
          type="button"
          size="xs"
          variant="destructive"
          onClick={handleRollbackRoles}
          disabled={loading}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Rollback Earned Roles
        </Button>
      ) : null}
    </div>
  )
}
