import type { Media } from '@/payload-types'

interface SubfeedAvatarProps {
  subfeed: {
    name?: string | null
    avatar?: number | Media | null
  }
  className?: string
  fallbackClassName?: string
}

export function SubfeedAvatar({ subfeed, className, fallbackClassName }: SubfeedAvatarProps) {
  const avatar =
    subfeed.avatar && typeof subfeed.avatar === 'object' ? (subfeed.avatar as Media) : undefined

  if (avatar?.url) {
    return (
      <img
        src={avatar.url}
        alt={avatar.alt || `${subfeed.name || 'Subfeed'} image`}
        className={className}
      />
    )
  }

  const initial = (subfeed.name || 'S').charAt(0).toUpperCase()

  return (
    <span className={fallbackClassName} aria-hidden="true">
      {initial}
    </span>
  )
}
