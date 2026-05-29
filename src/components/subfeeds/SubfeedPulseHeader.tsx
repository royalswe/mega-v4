import { Activity, Hash, TrendingUp } from 'lucide-react'
import Link from 'next/link'

import { Card, CardContent } from '@/components/ui/card'

interface SubfeedPulseLabels {
  title: string
  subtitle: string
  activity24h: string
  delta24h: string
  newLinks24h: string
  newPosts24h: string
  trendingTopics: string
  noTopics: string
  trendLabel: string
  window24h: string
  window7d: string
}

interface SubfeedPulseHeaderProps {
  labels: SubfeedPulseLabels
  activity24h: number
  delta24h: number
  newLinks24h: number
  newPosts24h: number
  topics: string[]
  trendPoints: number[]
  trendBucketLabels: string[]
  selectedWindow: '24h' | '7d'
  windowHrefs: {
    day: string
    week: string
  }
}

const formatDelta = (value: number): string => {
  if (value > 0) return `+${value}`
  return String(value)
}

export function SubfeedPulseHeader({
  labels,
  activity24h,
  delta24h,
  newLinks24h,
  newPosts24h,
  topics,
  trendPoints,
  trendBucketLabels,
  selectedWindow,
  windowHrefs,
}: SubfeedPulseHeaderProps) {
  const deltaClass =
    delta24h > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : delta24h < 0
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-muted-foreground'
  const maxTrendPoint = Math.max(...trendPoints, 1)

  return (
    <Card className="overflow-hidden border-0 bg-linear-to-r from-slate-100 via-sky-50 to-cyan-100 shadow-sm dark:from-slate-900 dark:via-sky-950 dark:to-cyan-950">
      <CardContent className="space-y-4 p-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{labels.title}</h2>
            <div className="inline-flex items-center gap-1 rounded-md border bg-background/70 p-1 text-xs backdrop-blur-sm">
              <Link
                href={windowHrefs.day}
                className={
                  selectedWindow === '24h'
                    ? 'rounded px-2 py-1 font-medium text-foreground'
                    : 'rounded px-2 py-1 text-muted-foreground hover:text-foreground'
                }
              >
                {labels.window24h}
              </Link>
              <Link
                href={windowHrefs.week}
                className={
                  selectedWindow === '7d'
                    ? 'rounded px-2 py-1 font-medium text-foreground'
                    : 'rounded px-2 py-1 text-muted-foreground hover:text-foreground'
                }
              >
                {labels.window7d}
              </Link>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-background/70 p-3 backdrop-blur-sm">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="size-4" aria-hidden="true" />
              {labels.activity24h}
            </div>
            <div className="text-2xl font-semibold">{activity24h}</div>
            <div className={`text-xs ${deltaClass}`}>
              {formatDelta(delta24h)} {labels.delta24h}
            </div>
          </div>

          <div className="rounded-lg border bg-background/70 p-3 backdrop-blur-sm">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="size-4" aria-hidden="true" />
              {labels.newLinks24h}
            </div>
            <div className="text-2xl font-semibold">{newLinks24h}</div>
          </div>

          <div className="rounded-lg border bg-background/70 p-3 backdrop-blur-sm">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="size-4" aria-hidden="true" />
              {labels.newPosts24h}
            </div>
            <div className="text-2xl font-semibold">{newPosts24h}</div>
          </div>
        </div>

        <div className="rounded-lg border bg-background/70 p-3 backdrop-blur-sm">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="size-4" aria-hidden="true" />
            {labels.trendLabel}
          </div>
          <div className="flex h-16 items-end gap-1" aria-label={labels.trendLabel}>
            {trendPoints.map((point, index) => {
              const height = Math.max(10, Math.round((point / maxTrendPoint) * 100))
              const label = trendBucketLabels[index] ?? `${index + 1}`
              return (
                <div
                  key={`${index}-${point}`}
                  className="min-w-0 flex-1 animate-in fade-in-0 slide-in-from-bottom-1 rounded-sm bg-cyan-500/80 duration-500"
                  aria-label={`${label}: ${point}`}
                  style={{ height: `${height}%` }}
                  title={`${label}: ${point}`}
                />
              )
            })}
          </div>
        </div>

        <div className="rounded-lg border bg-background/70 p-3 backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Hash className="size-4" aria-hidden="true" />
            {labels.trendingTopics}
          </div>
          {topics.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {topics.map((topic) => (
                <span
                  key={topic}
                  className="rounded-full border bg-cyan-100/70 px-2.5 py-1 text-xs font-medium text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-100"
                >
                  {topic}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{labels.noTopics}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
