'use client'

import { trackClick } from '@/app/actions/trackClick'

interface TrackedLinkProps {
  url: string
  title: string
  linkId: number
  className?: string
}

export function TrackedLink({ url, title, linkId, className }: TrackedLinkProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => {
        // Fire and forget - don't await to avoid delaying navigation
        trackClick(linkId)
      }}
    >
      {title}
    </a>
  )
}
