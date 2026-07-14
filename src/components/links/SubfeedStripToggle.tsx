'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { setHomeSubfeedsViewPreference } from '@/app/actions/links'

type HomeSubfeedsView = 'trending' | 'joined'

export function SubfeedStripToggle({
  initialView,
  hasJoinedSubfeeds,
  labels,
}: {
  initialView: HomeSubfeedsView
  hasJoinedSubfeeds: boolean
  labels: {
    trending: string
    joined: string
  }
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentView, setCurrentView] = useState<HomeSubfeedsView>(initialView)

  useEffect(() => {
    setCurrentView(initialView)
  }, [initialView])

  const handleSelect = (nextView: HomeSubfeedsView) => {
    if (nextView === currentView) return
    if (nextView === 'joined' && !hasJoinedSubfeeds) return

    const previous = currentView
    setCurrentView(nextView)

    startTransition(async () => {
      try {
        await setHomeSubfeedsViewPreference(nextView)
        router.refresh()
      } catch (error) {
        console.error('Failed to persist home subfeed strip preference:', error)
        setCurrentView(previous)
      }
    })
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-md border bg-muted/40 p-1 text-xs">
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleSelect('trending')}
        className={`rounded px-2 py-1 ${currentView === 'trending' ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {labels.trending}
      </button>
      <button
        type="button"
        disabled={isPending || !hasJoinedSubfeeds}
        onClick={() => handleSelect('joined')}
        className={`rounded px-2 py-1 ${currentView === 'joined' ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'} ${!hasJoinedSubfeeds ? 'opacity-50' : ''}`}
      >
        {labels.joined}
      </button>
    </div>
  )
}
