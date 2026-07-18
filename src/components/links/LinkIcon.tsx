import { FileText, Video, Image, Music, Gamepad2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type LinkType = 'article' | 'video' | 'image' | 'audio' | 'game' | string

export function LinkIcon({ type, className }: { type: LinkType; className?: string }) {
  const Icon = (() => {
    switch (type) {
      case 'article':
        return FileText
      case 'video':
        return Video
      case 'image':
        return Image
      case 'audio':
        return Music
      case 'game':
        return Gamepad2
      default:
        return FileText
    }
  })()

  const colorClass = (() => {
    switch (type) {
      case 'article':
        return 'text-slate-600'
      case 'video':
        return 'text-red-500'
      case 'image':
        return 'text-emerald-500'
      case 'audio':
        return 'text-indigo-500'
      case 'game':
        return 'text-amber-500'
      default:
        return 'text-slate-600'
    }
  })()

  return <Icon size={40} className={cn(colorClass, className)} />
}
