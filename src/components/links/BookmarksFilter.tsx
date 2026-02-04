'use client'

import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

export function BookmarksFilter({ label }: { label: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const isBookmarked = searchParams.get('bookmarks') === 'true'

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set(name, value)
      return params.toString()
    },
    [searchParams],
  )

  const handleToggle = (checked: boolean) => {
    if (checked) {
      router.push('?' + createQueryString('bookmarks', 'true'))
    } else {
      // Remove the param if false to clean up URL
      const params = new URLSearchParams(searchParams.toString())
      params.delete('bookmarks')
      router.push('?' + params.toString())
    }
  }

  return (
    <div className="flex items-center space-x-2">
      <Switch id="bookmarks-filter" checked={isBookmarked} onCheckedChange={handleToggle} />
      <Label htmlFor="bookmarks-filter">{label}</Label>
    </div>
  )
}
