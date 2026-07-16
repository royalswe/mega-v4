'use client'

import Link from 'next/link'
import { Flame, MessageCircleMore, Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

interface MainFeedHighlightsLabels {
  title: string
  subtitle: string
  trendingNow: string
  newInYourSubfeeds: string
  freshDiscussions: string
  loginHint: string
}

interface MainFeedHighlightsProps {
  labels: MainFeedHighlightsLabels
  trendingNowCount: number
  newInYourSubfeedsCount: number | null
  freshDiscussionsCount: number
  trendingNowHref: string
  newInYourSubfeedsHref: string
  freshDiscussionsHref: string
  trendingNowTrend: -1 | 0 | 1
  newInYourSubfeedsTrend: -1 | 0 | 1 | null
  freshDiscussionsTrend: -1 | 0 | 1
  activeSignal?: 'trending' | 'subfeeds' | 'discussions' | null
}

function AnimatedCount({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    let rafId = 0
    const durationMs = 420
    const start = performance.now()

    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(1, elapsed / durationMs)
      setDisplayValue(Math.round(value * progress))

      if (progress < 1) {
        rafId = requestAnimationFrame(tick)
      }
    }

    setDisplayValue(0)
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [value])

  return <>{displayValue}</>
}

function TrendPill({ trend }: { trend: -1 | 0 | 1 | null }) {
  const content = useMemo(() => {
    if (trend === null) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          <Minus className="size-3" aria-hidden="true" />
        </span>
      )
    }

    if (trend > 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
          <TrendingUp className="size-3" aria-hidden="true" />
        </span>
      )
    }

    if (trend < 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-600 dark:text-rose-400">
          <TrendingDown className="size-3" aria-hidden="true" />
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
        <Minus className="size-3" aria-hidden="true" />
      </span>
    )
  }, [trend])

  return content
}

export function MainFeedHighlights({
  labels,
  trendingNowCount,
  newInYourSubfeedsCount,
  freshDiscussionsCount,
  trendingNowHref,
  newInYourSubfeedsHref,
  freshDiscussionsHref,
  trendingNowTrend,
  newInYourSubfeedsTrend,
  freshDiscussionsTrend,
  activeSignal,
}: MainFeedHighlightsProps) {
  const activeClasses = 'ring-1 ring-sky-400/70 dark:ring-sky-600/60'

  return (
    <section
      className="p-4 rounded-xl border bg-linear-to-r shadow-sm
      from-slate-100 via-sky-50 to-cyan-50
      dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800"
    >
      {' '}
      <div className="mb-3">
        <h2 className="text-base font-semibold tracking-tight">{labels.title}</h2>
        <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link
          href={trendingNowHref}
          className={`rounded-lg border bg-background/80 p-3 backdrop-blur-sm transition hover:-translate-y-px hover:border-sky-300/60 dark:border-sky-900/50 dark:bg-slate-950/70 ${activeSignal === 'trending' ? activeClasses : ''}`}
        >
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Flame className="size-4" aria-hidden="true" />
              {labels.trendingNow}
            </span>
            <TrendPill trend={trendingNowTrend} />
          </div>
          <p className="text-2xl font-semibold leading-none">
            <AnimatedCount value={trendingNowCount} />
          </p>
        </Link>

        <Link
          href={newInYourSubfeedsHref}
          className={`rounded-lg border bg-background/80 p-3 backdrop-blur-sm transition hover:-translate-y-px hover:border-sky-300/60 dark:border-sky-900/50 dark:bg-slate-950/70 ${activeSignal === 'subfeeds' ? activeClasses : ''}`}
        >
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Sparkles className="size-4" aria-hidden="true" />
              {labels.newInYourSubfeeds}
            </span>
            <TrendPill trend={newInYourSubfeedsTrend} />
          </div>
          <p className="text-2xl font-semibold leading-none">
            {newInYourSubfeedsCount === null ? (
              '—'
            ) : (
              <AnimatedCount value={newInYourSubfeedsCount} />
            )}
          </p>
          {newInYourSubfeedsCount === null ? (
            <p className="mt-1 text-xs text-muted-foreground">{labels.loginHint}</p>
          ) : null}
        </Link>

        <Link
          href={freshDiscussionsHref}
          className={`rounded-lg border bg-background/80 p-3 backdrop-blur-sm transition hover:-translate-y-px hover:border-sky-300/60 dark:border-sky-900/50 dark:bg-slate-950/70 ${activeSignal === 'discussions' ? activeClasses : ''}`}
        >
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <MessageCircleMore className="size-4" aria-hidden="true" />
              {labels.freshDiscussions}
            </span>
            <TrendPill trend={freshDiscussionsTrend} />
          </div>
          <p className="text-2xl font-semibold leading-none">
            <AnimatedCount value={freshDiscussionsCount} />
          </p>
        </Link>
      </div>
    </section>
  )
}
