'use client'

import { useTransition } from 'react'
import { Bookmark } from 'lucide-react'
import { toggleBookmark } from '@/app/actions/links'

export function BookmarkButton({ linkId }: { linkId: number }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      className="flex items-center hover:underline"
      disabled={isPending}
      onClick={() => startTransition(() => toggleBookmark(linkId))}
    >
      <Bookmark className="w-4 h-4 mr-1" /> Bookmark
    </button>
  )
}
