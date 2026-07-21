'use client'

import { useOptimistic, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { vote } from '@/app/actions/posts'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type VoteState = {
  votes: number
  userVote?: 'up' | 'down' | null
}

export function VoteButtons({
  postId,
  votes,
  userId,
  userVote,
}: {
  postId: number
  votes: number
  userId?: string | number | null
  userVote?: 'up' | 'down' | null
}) {
  const [, startTransition] = useTransition()
  const isEnabled = !!userId

  const [optimisticState, addOptimisticVote] = useOptimistic<VoteState, 'up' | 'down'>(
    { votes, userVote },
    (state, newVoteType) => {
      let newVotes = state.votes
      let newUserVote = state.userVote

      if (state.userVote === newVoteType) {
        // Toggle off
        newUserVote = null
        newVotes = newVoteType === 'up' ? newVotes - 1 : newVotes + 1
      } else {
        // Toggle on or switch
        if (state.userVote === 'up') newVotes--
        if (state.userVote === 'down') newVotes++

        newUserVote = newVoteType
        newVotes = newVoteType === 'up' ? newVotes + 1 : newVotes - 1
      }

      return {
        votes: newVotes,
        userVote: newUserVote,
      }
    },
  )

  const handleVote = (type: 'up' | 'down') => {
    startTransition(async () => {
      addOptimisticVote(type)
      await vote(postId, type)
    })
  }

  return (
    <div className="flex flex-col items-center">
      <Button
        size="sm"
        variant="ghost"
        disabled={!isEnabled}
        onClick={() => handleVote('up')}
        className={cn(
          optimisticState.userVote === 'up'
            ? 'text-amber-500! hover:text-amber-400!'
            : 'hover:text-amber-500/70',
        )}
      >
        <ArrowUp className="w-4 h-4" />
      </Button>
      <span
        className={cn(
          'text-sm font-bold',
          optimisticState.userVote === 'up' && 'text-amber-500!',
          optimisticState.userVote === 'down' && 'text-red-500!',
        )}
      >
        {optimisticState.votes}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={!isEnabled}
        onClick={() => handleVote('down')}
        className={cn(
          optimisticState.userVote === 'down'
            ? 'text-red-500! hover:text-red-400!'
            : 'hover:text-red-500/70',
        )}
      >
        <ArrowDown className="w-4 h-4" />
      </Button>
    </div>
  )
}
