import { cn } from '@/lib/utils'
import {
  ServerIcon,
  FILE_TEXT,
  VIDEO,
  IMAGE,
  MUSIC,
  GAMEPAD_2,
  type LucideIconData,
} from '@/components/ui/ServerIcon'

type LinkType = 'article' | 'video' | 'image' | 'audio' | 'game' | string

const iconByType: Record<string, LucideIconData> = {
  article: FILE_TEXT,
  video: VIDEO,
  image: IMAGE,
  audio: MUSIC,
  game: GAMEPAD_2,
}

const colorByType: Record<string, string> = {
  article: 'text-slate-600',
  video: 'text-red-500',
  image: 'text-emerald-500',
  audio: 'text-indigo-500',
  game: 'text-amber-500',
}

export function LinkIcon({ type, className }: { type: LinkType; className?: string }) {
  const icon = iconByType[type] ?? FILE_TEXT
  const colorClass = colorByType[type] ?? 'text-slate-600'

  return <ServerIcon icon={icon} size={40} className={cn(colorClass, className)} />
}
