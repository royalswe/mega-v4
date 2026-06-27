'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'

import { reviewReport } from '@/app/actions/reports'
import { Button } from '@/components/ui/button'

export function ModerationActionButtons({ reportId }: { reportId: number }) {
  const [pending, startTransition] = useTransition()

  const handleDecision = (decision: 'approved' | 'rejected') => {
    startTransition(async () => {
      try {
        await reviewReport(reportId, decision)
        toast.success(`Report ${decision}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Review failed'
        toast.error(message)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => handleDecision('approved')}
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => handleDecision('rejected')}
      >
        Reject
      </Button>
    </div>
  )
}
