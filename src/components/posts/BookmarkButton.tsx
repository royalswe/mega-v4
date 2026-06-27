'use client'

import type { AppDictionary } from '@/lib/dictionaries'

import { useTransition } from 'react'
import { Bookmark } from 'lucide-react'
import { toggleBookmark } from '@/app/actions/posts'

export function BookmarkButton({
  postId,
  userId,
  isBookmarked,
  dict,
}: {
  postId: number
  userId?: string | number | null
  isBookmarked?: boolean
  dict: AppDictionary
}) {
  const [isPending, startTransition] = useTransition()
  const isEnabled = !!userId

  return (
    <button
      className={`flex items-center hover:underline ${!isEnabled ? 'opacity-50 cursor-not-allowed' : ''} ${isBookmarked ? 'text-orange-600 font-medium' : ''}`}
      disabled={isPending || !isEnabled}
      onClick={() => startTransition(() => toggleBookmark(postId))}
    >
      <Bookmark className={`w-4 h-4 mr-1 ${isBookmarked ? 'fill-current' : ''}`} />
      {isBookmarked ? dict.common.bookmarked : dict.common.bookmark}
    </button>
  )
}
