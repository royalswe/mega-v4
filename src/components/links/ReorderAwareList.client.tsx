'use client'

import { Children, useEffect, useMemo, useRef, useState } from 'react'

export function ReorderAwareList({
  itemIds,
  children,
}: {
  itemIds: number[]
  children: React.ReactNode
}) {
  const previousIdsRef = useRef<number[]>(itemIds)
  const [movedIds, setMovedIds] = useState<Set<number>>(new Set())

  const childArray = useMemo(() => Children.toArray(children), [children])

  useEffect(() => {
    const previousIds = previousIdsRef.current
    if (previousIds.length === 0) {
      previousIdsRef.current = itemIds
      return
    }

    const previousIndexById = new Map(previousIds.map((id, index) => [id, index]))
    const moved = new Set<number>()

    itemIds.forEach((id, index) => {
      const previousIndex = previousIndexById.get(id)
      if (previousIndex !== undefined && previousIndex !== index) {
        moved.add(id)
      }
    })

    previousIdsRef.current = itemIds

    if (moved.size === 0) return

    setMovedIds(moved)
    const timeoutId = window.setTimeout(() => {
      setMovedIds(new Set())
    }, 900)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [itemIds])

  return (
    <div className="flex flex-col gap-4">
      {childArray.map((child, index) => {
        const id = itemIds[index]
        const wasMoved = id !== undefined && movedIds.has(id)

        return (
          <div
            key={id ?? index}
            className={`rounded-xl transition-colors duration-700 ${wasMoved ? 'bg-sky-100/60 ring-1 ring-sky-300/70 dark:bg-sky-950/30 dark:ring-sky-800/60' : ''}`}
          >
            {child}
          </div>
        )
      })}
    </div>
  )
}
