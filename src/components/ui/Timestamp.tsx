import { formatDistanceToNow } from 'date-fns'

interface TimestampProps {
  date: string | Date
  prefix?: string
  className?: string
}

export function Timestamp({ date, prefix = '', className = '' }: TimestampProps) {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const relativeTime = formatDistanceToNow(dateObj, { addSuffix: true })

  return (
    <time dateTime={dateObj.toISOString()} className={`text-sm text-muted-foreground ${className}`}>
      {prefix && `${prefix} `}
      {relativeTime}
    </time>
  )
}
