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

  return <Icon className={cn(className)} />
}
