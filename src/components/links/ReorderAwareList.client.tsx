'use client'

import { Children, type ReactNode, useEffect, useMemo, useState } from 'react'

export function ReorderAwareList({
  itemIds,
  children,
  className,
}: {
  itemIds: number[]
  children: ReactNode
  className?: string
}) {
  const childArray = useMemo(() => Children.toArray(children), [children])
  const [stableOrder, setStableOrder] = useState<number[]>(itemIds)

  useEffect(() => {
    setStableOrder((previous) => {
      if (previous.length === 0) return itemIds

      const nextSet = new Set(itemIds)
      const kept = previous.filter((id) => nextSet.has(id))
      const previousSet = new Set(previous)
      const appended = itemIds.filter((id) => !previousSet.has(id))

      return [...kept, ...appended]
    })
  }, [itemIds])

  const childById = useMemo(() => {
    const map = new Map<number, ReactNode>()
    itemIds.forEach((id, index) => {
      map.set(id, childArray[index])
    })
    return map
  }, [itemIds, childArray])

  const containerClassName = className ?? 'flex flex-col gap-4'

  return (
    <div className={containerClassName}>
      {stableOrder.map((id) => {
        const child = childById.get(id)
        if (!child) return null
        return <div key={id}>{child}</div>
      })}
    </div>
  )
}
