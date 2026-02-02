'use client'

import { useTransition } from 'react'
import { Bookmark } from 'lucide-react'
import { toggleBookmark } from '@/app/actions/links'

export function BookmarkButton({
  linkId,
  userId,
  isBookmarked,
}: {
  linkId: number
  userId?: string | number | null
  isBookmarked?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const isEnabled = !!userId

  return (
    <button
      className={`flex items-center hover:underline ${!isEnabled ? 'opacity-50 cursor-not-allowed' : ''} ${isBookmarked ? 'text-orange-600 font-medium' : ''}`}
      disabled={isPending || !isEnabled}
      onClick={() => startTransition(() => toggleBookmark(linkId))}
    >
      <Bookmark className={`w-4 h-4 mr-1 ${isBookmarked ? 'fill-current' : ''}`} />
      {isBookmarked ? 'Bookmarked' : 'Bookmark'}
    </button>
  )
}
