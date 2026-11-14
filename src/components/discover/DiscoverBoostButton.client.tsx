'use client'

import { useState } from 'react'

import { boostToMainFeed } from '@/app/actions/promotion'
import { Button } from '@/components/ui/button'

type BoostCollection = 'links' | 'posts'

interface DiscoverBoostButtonProps {
  collection: BoostCollection
  id: number
  boostLabel: string
  boostedLabel: string
  errorLabels: {
    notLoggedIn: string
    noStanding: string
    ineligible: string
    notFound: string
    invalid: string
  }
}

export function DiscoverBoostButton({
  collection,
  id,
  boostLabel,
  boostedLabel,
  errorLabels,
}: DiscoverBoostButtonProps) {
  const [pending, setPending] = useState(false)
  const [boosted, setBoosted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (boosted) {
    return <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{boostedLabel}</span>
  }

  const errorText = (code: string): string => {
    switch (code) {
      case 'not-logged-in':
        return errorLabels.notLoggedIn
      case 'no-standing':
        return errorLabels.noStanding
      case 'ineligible':
        return errorLabels.ineligible
      case 'not-found':
        return errorLabels.notFound
      default:
        return errorLabels.invalid
    }
  }

  const onClick = async () => {
    setPending(true)
    setError(null)
    try {
      const result = await boostToMainFeed({ collection, id })
      if (result.ok) {
        setBoosted(true)
      } else {
        setError(errorText(result.error))
      }
    } catch {
      setError(errorLabels.invalid)
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <Button type="button" size="sm" onClick={onClick} disabled={pending}>
        {pending ? '…' : boostLabel}
      </Button>
      {error ? <p className="mt-1 text-xs text-rose-500">{error}</p> : null}
    </div>
  )
}
