import Image from 'next/image'
import { User, Media } from '@/payload-types'
import { User as UserIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AvatarProps {
  user: User | null | undefined
  className?: string
  loading?: 'lazy' | 'eager'
  sizes?: string
}

export function Avatar({ user, className, loading = 'lazy', sizes = '48px' }: AvatarProps) {
  const avatar = user?.avatar as Media | undefined

  if (avatar?.url) {
    return (
      <div className={cn('relative overflow-hidden rounded-full bg-muted', className)}>
        <Image
          src={avatar.url}
          alt={avatar.alt || user?.username || 'User Avatar'}
          fill
          loading={loading}
          sizes={sizes}
          className="object-cover"
        />
      </div>
    )
  }

  return (
    <div className={cn('flex items-center justify-center rounded-full bg-muted', className)}>
      <UserIcon className="h-1/2 w-1/2 text-muted-foreground" />
    </div>
  )
}
