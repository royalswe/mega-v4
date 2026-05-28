'use client'

import { type FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { submitReport } from '@/app/actions/reports'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type ReportTargetType = 'post' | 'comment' | 'link' | 'user'
type ReportReason = 'spam' | 'abuse' | 'broken_link' | 'harassment' | 'nsfw' | 'other'

const reasonLabels: Record<ReportReason, string> = {
  spam: 'Spam',
  abuse: 'Abuse',
  broken_link: 'Broken link',
  harassment: 'Harassment',
  nsfw: 'NSFW mismatch',
  other: 'Other',
}

export function ReportForm({
  targetType,
  targetId,
}: {
  targetType: ReportTargetType
  targetId: number
}) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reason, setReason] = useState<ReportReason>('spam')
  const [details, setDetails] = useState('')

  const targetTitle = useMemo(() => {
    if (targetType === 'post') return `Post #${targetId}`
    if (targetType === 'comment') return `Comment #${targetId}`
    if (targetType === 'link') return `Link #${targetId}`
    return `User #${targetId}`
  }, [targetId, targetType])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setIsSubmitting(true)

    try {
      await submitReport({
        targetType,
        targetId,
        reason,
        details,
      })

      toast.success('Report submitted. Thank you for helping keep the community safe.')
      router.push('/')
      router.refresh()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit report'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="max-w-xl mx-auto">
      <CardHeader>
        <CardTitle>Report Content</CardTitle>
        <CardDescription>Target: {targetTitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason</label>
            <Select value={reason} onValueChange={(value) => setReason(value as ReportReason)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="spam">{reasonLabels.spam}</SelectItem>
                <SelectItem value="abuse">{reasonLabels.abuse}</SelectItem>
                <SelectItem value="broken_link">{reasonLabels.broken_link}</SelectItem>
                <SelectItem value="harassment">{reasonLabels.harassment}</SelectItem>
                <SelectItem value="nsfw">{reasonLabels.nsfw}</SelectItem>
                <SelectItem value="other">{reasonLabels.other}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="details">
              Details (optional)
            </label>
            <Textarea
              id="details"
              placeholder="Share any context that helps moderators review quickly"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={1200}
            />
          </div>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
