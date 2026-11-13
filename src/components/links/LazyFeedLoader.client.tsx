'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Lazy-loads the next feed page when the reader scrolls near the sentinel
 * (Reddit/Facebook style): the navigation is wrapped in `startTransition` so
 * the current feed stays visible (no route-level skeleton flash) while the
 * next page renders, and `ReorderAwareList` appends only the new cards when
 * it arrives.
 */
export function LazyFeedLoader({ nextHref, pendingLabel }: { nextHref: string; pendingLabel: string }) {
  const router = useRouter()
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [isPending, startTransition] = useTransition()
  const [requested, setRequested] = useState(false)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    // Re-arm for each new page render (nextHref changes per page).
    setRequested(false)
    let fired = false

    const observer = new IntersectionObserver(
      (entries) => {
        if (fired || !entries[0]?.isIntersecting) return
        fired = true
        setRequested(true)
        startTransition(() => {
          router.push(nextHref, { scroll: false })
        })
      },
      // Start loading well before the reader reaches the end.
      { rootMargin: '800px 0px' },
    )

    observer.observe(sentinel)
    return () => {
      fired = true
      observer.disconnect()
    }
  }, [nextHref, router])

  return (
    <div ref={sentinelRef} className="flex justify-center py-6" role="status">
      {isPending || requested ? (
        <span className="text-sm text-muted-foreground">{pendingLabel}</span>
      ) : null}
    </div>
  )
}
