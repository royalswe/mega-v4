'use client'

import { Button } from '@/components/ui/button'

interface Props {
  isSubmitting: boolean
  submitLabel: string
  submittingLabel: string
  onCancel?: () => void
  cancelLabel?: string
}

export function SubmissionActionRow({
  isSubmitting,
  submitLabel,
  submittingLabel,
  onCancel,
  cancelLabel = 'Close',
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? submittingLabel : submitLabel}
      </Button>
      {onCancel ? (
        <Button type="button" variant="outline" disabled={isSubmitting} onClick={onCancel}>
          {cancelLabel}
        </Button>
      ) : null}
    </div>
  )
}
