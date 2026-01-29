'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { vote } from './actions'
import { ArrowUp, ArrowDown } from 'lucide-react'

export function VoteButtons({ linkId, votes }: { linkId: number; votes: number }) {
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-col items-center">
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => startTransition(() => vote(linkId, 'up'))}
      >
        <ArrowUp className="w-4 h-4" />
      </Button>
      <span className="text-sm font-bold">{votes}</span>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => startTransition(() => vote(linkId, 'down'))}
      >
        <ArrowDown className="w-4 h-4" />
      </Button>
    </div>
  )
}
