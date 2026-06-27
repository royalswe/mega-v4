'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { setMainFeedMixPreference } from '@/app/actions/links'

export function FeedMixFilter({
  initialValue,
  label,
  description,
}: {
  initialValue: boolean
  label: string
  description?: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [includeSubfeeds, setIncludeSubfeeds] = useState(initialValue)

  useEffect(() => {
    setIncludeSubfeeds(initialValue)
  }, [initialValue])

  const clearMixParamHref = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('mixSubfeeds')

    const nextQuery = params.toString()
    return nextQuery ? `${pathname}?${nextQuery}` : pathname
  }

  const handleToggle = (checked: boolean) => {
    const previous = includeSubfeeds
    setIncludeSubfeeds(checked)

    startTransition(async () => {
      try {
        await setMainFeedMixPreference(checked)
        router.replace(clearMixParamHref())
        router.refresh()
      } catch (error) {
        console.error('Failed to persist feed mix preference:', error)
        setIncludeSubfeeds(previous)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Switch
        id="mix-subfeeds-filter"
        checked={includeSubfeeds}
        disabled={isPending}
        onCheckedChange={handleToggle}
      />
      <div className="flex flex-col leading-tight">
        <Label htmlFor="mix-subfeeds-filter">{label}</Label>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </div>
    </div>
  )
}
