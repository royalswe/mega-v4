'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { vote } from './actions'
import { ArrowUp, ArrowDown } from 'lucide-react'

export function VoteButtons({ linkId }: { linkId: number }) {
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex items-center space-x-2">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => startTransition(() => vote(linkId, 'up'))}
      >
        <ArrowUp className="w-4 h-4" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => startTransition(() => vote(linkId, 'down'))}
      >
        <ArrowDown className="w-4 h-4" />
      </Button>
    </div>
  )
}
