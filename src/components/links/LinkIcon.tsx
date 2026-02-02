import React from 'react'
import { FileText, Video, Image, Music, Gamepad2 } from 'lucide-react'

type LinkType = 'article' | 'video' | 'image' | 'audio' | 'game' | string

export function LinkIcon({ type }: { type: LinkType }) {
  switch (type) {
    case 'article':
      return <FileText className="w-4 h-4" />
    case 'video':
      return <Video className="w-4 h-4" />
    case 'image':
      return <Image className="w-4 h-4" />
    case 'audio':
      return <Music className="w-4 h-4" />
    case 'game':
      return <Gamepad2 className="w-4 h-4" />
    default:
      return <FileText className="w-4 h-4" />
  }
}
