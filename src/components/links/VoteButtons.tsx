'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { vote } from '@/app/actions/links'
import { ArrowUp, ArrowDown } from 'lucide-react'

export function VoteButtons({
  linkId,
  votes,
  userId,
  userVote,
}: {
  linkId: number
  votes: number
  userId?: string | number | null
  userVote?: 'up' | 'down'
}) {
  const [isPending, startTransition] = useTransition()
  const isEnabled = !!userId

  return (
    <div className="flex flex-col items-center">
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending || !isEnabled}
        onClick={() => startTransition(() => vote(linkId, 'up'))}
        className={userVote === 'up' ? 'text-green-600 hover:text-green-400' : ''}
      >
        <ArrowUp className="w-4 h-4" />
      </Button>
      <span
        className={`text-sm font-bold ${userVote === 'up' ? 'text-green-600' : userVote === 'down' ? 'text-orange-600' : ''}`}
      >
        {votes}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending || !isEnabled}
        onClick={() => startTransition(() => vote(linkId, 'down'))}
        className={userVote === 'down' ? 'text-orange-600 hover:text-orange-400' : ''}
      >
        <ArrowDown className="w-4 h-4" />
      </Button>
    </div>
  )
}
