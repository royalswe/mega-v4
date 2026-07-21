'use client'

import type { AppDictionary } from '@/lib/dictionaries'

import { useOptimistic, useTransition } from 'react'
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
  const [, startTransition] = useTransition()
  const isEnabled = !!userId

  const [optimisticBookmarked, toggleOptimisticBookmark] = useOptimistic<boolean, void>(
    !!isBookmarked,
    (state) => !state,
  )

  const handleToggle = () => {
    startTransition(async () => {
      toggleOptimisticBookmark()
      await toggleBookmark(postId)
    })
  }

  return (
    <button
      className={`flex items-center hover:underline ${!isEnabled ? 'opacity-50 cursor-not-allowed' : ''} ${optimisticBookmarked ? 'text-amber-500 font-medium' : ''}`}
      disabled={!isEnabled}
      onClick={handleToggle}
    >
      <Bookmark className={`w-4 h-4 mr-1 ${optimisticBookmarked ? 'fill-current' : ''}`} />
      {optimisticBookmarked ? dict.common.bookmarked : dict.common.bookmark}
    </button>
  )
}
