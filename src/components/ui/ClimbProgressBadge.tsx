import { promotionThresholdForFeed } from '@/lib/community/promotion'
import { cn } from '@/lib/utils'

export interface ClimbProgressItemLike {
  feed?: string | null
  score?: number | null
  upvotes?: number | null
  rankingScore?: number | null
  featured?: boolean | null
  discoveryBoosted?: boolean | null
}

const readNum = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

export const computeClimbProgress = (item: ClimbProgressItemLike): number => {
  if (item.featured === true || item.discoveryBoosted === true) {
    return 1
  }

  const threshold = promotionThresholdForFeed(item.feed)
  const raw = Math.min(
    readNum(item.score) / threshold.score,
    readNum(item.upvotes) / threshold.upvotes,
    readNum(item.rankingScore) / threshold.rankingScore,
  )
  return Math.max(0, Math.min(1, raw))
}

interface ClimbProgressBadgeProps {
  item: ClimbProgressItemLike
  labelTemplate?: string
  tooltip?: string
  className?: string
}

export function ClimbProgressBadge({
  item,
  labelTemplate = '{percent}% mot Main Feed',
  tooltip,
  className,
}: ClimbProgressBadgeProps) {
  const progress = computeClimbProgress(item)
  const percent = Math.round(progress * 100)
  const label = labelTemplate.replace('{percent}', String(percent))

  return (
    <span
      title={tooltip}
      className={cn(
        'relative inline-flex items-center overflow-hidden rounded-md border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 bg-emerald-500/15 dark:bg-emerald-500/20"
        style={{ width: `${percent}%` }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 h-0.5 bg-emerald-600 dark:bg-emerald-400"
        style={{ width: `${percent}%` }}
      />
      <span className="relative z-10">{label}</span>
    </span>
  )
}
