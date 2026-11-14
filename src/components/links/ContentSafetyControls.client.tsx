'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldAlert, RotateCcw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { rollbackPromotion, setQuarantineContent } from '@/app/actions/promotion'

interface ContentSafetyControlsProps {
  collection: 'links' | 'posts'
  id: number
  isQuarantined?: boolean | null
  isPromotedOrPriority?: boolean | null
}

export function ContentSafetyControls({
  collection,
  id,
  isQuarantined = false,
  isPromotedOrPriority = false,
}: ContentSafetyControlsProps) {
  const router = useRouter()
  const [quarantined, setQuarantined] = useState(Boolean(isQuarantined))
  const [loading, setLoading] = useState(false)

  const handleToggleQuarantine = async () => {
    setLoading(true)
    try {
      const next = !quarantined
      await setQuarantineContent({ collection, id, quarantined: next })
      setQuarantined(next)
      toast.success(next ? 'Content quarantined' : 'Content unquarantined')
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error('Failed to update quarantine status')
    } finally {
      setLoading(false)
    }
  }

  const handleRollbackPromotion = async () => {
    setLoading(true)
    try {
      await rollbackPromotion({ collection, id })
      toast.success('Promotions and priority rolled back to organic baseline')
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error('Failed to rollback promotion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 border rounded-md bg-muted/30 text-xs">
      <span className="font-semibold text-muted-foreground mr-1">Admin Safety Controls:</span>
      <Button
        type="button"
        size="xs"
        variant={quarantined ? 'destructive' : 'outline'}
        onClick={handleToggleQuarantine}
        disabled={loading}
      >
        {quarantined ? (
          <>
            <ShieldCheck className="h-3.5 w-3.5 mr-1" />
            Unquarantine
          </>
        ) : (
          <>
            <ShieldAlert className="h-3.5 w-3.5 mr-1" />
            Quarantine
          </>
        )}
      </Button>
      {isPromotedOrPriority ? (
        <Button
          type="button"
          size="xs"
          variant="secondary"
          onClick={handleRollbackPromotion}
          disabled={loading}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Rollback Promotion
        </Button>
      ) : null}
    </div>
  )
}
