'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { XIcon } from 'lucide-react'

import { LinkSubmitForm } from '@/components/links/LinkSubmitForm'
import { PostSubmitForm } from '@/components/posts/PostSubmitForm'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const CLOSE_ANIMATION_MS = 180

interface Props {
  subfeedId: number
  subfeedName: string
  mode: 'link' | 'post'
  dict: Record<string, any>
}

export function SubfeedCreatePanel({ subfeedId, subfeedName, mode, dict }: Props) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleId = useId()

  const subfeedOption = { id: subfeedId, name: subfeedName }
  const label =
    mode === 'link'
      ? dict.subfeeds?.submitLink || 'Submit Link'
      : dict.subfeeds?.createPost || 'Create Post'

  const dialogTitle =
    mode === 'link'
      ? dict.subfeeds?.submitLinkModalTitle || `Submit a link to ${subfeedName}`
      : dict.subfeeds?.createPostModalTitle || `Create a post in ${subfeedName}`

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const openModal = useCallback(() => {
    clearCloseTimer()
    setIsMounted(true)

    requestAnimationFrame(() => {
      setIsOpen(true)
    })
  }, [clearCloseTimer])

  const closeModal = useCallback(() => {
    if (!isMounted) {
      return
    }

    setIsOpen(false)
    clearCloseTimer()

    closeTimerRef.current = setTimeout(() => {
      setIsMounted(false)
      closeTimerRef.current = null
    }, CLOSE_ANIMATION_MS)
  }, [clearCloseTimer, isMounted])

  useEffect(
    () => () => {
      clearCloseTimer()
    },
    [clearCloseTimer],
  )

  useEffect(() => {
    if (!isMounted) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeModal()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [closeModal, isMounted])

  useEffect(() => {
    if (!isMounted) {
      return
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isMounted])

  function handleSuccess() {
    closeModal()
    router.refresh()
  }

  const form =
    mode === 'link' ? (
      <LinkSubmitForm
        dict={dict}
        subfeeds={[subfeedOption]}
        defaultSubfeedId={subfeedId}
        defaultFeed="subfeed"
        lockDestination
        onSuccess={handleSuccess}
        onCancel={closeModal}
      />
    ) : (
      <PostSubmitForm
        dict={dict}
        subfeeds={[subfeedOption]}
        defaultSubfeedId={subfeedId}
        defaultFeed="subfeed"
        lockDestination
        onSuccess={handleSuccess}
        onCancel={closeModal}
      />
    )

  return (
    <div>
      <Button variant="outline" size="sm" onClick={isOpen ? closeModal : openModal}>
        + {label}
      </Button>
      {isMounted ? (
        <div className="fixed inset-0 z-40 p-4 sm:p-6">
          <button
            type="button"
            aria-label={dict.subfeeds?.closeModalLabel || 'Close form modal'}
            className={cn(
              'absolute inset-0 bg-background/70 backdrop-blur-[2px] transition-opacity duration-150',
              isOpen ? 'opacity-100' : 'opacity-0',
            )}
            onClick={closeModal}
          />

          <div className="relative flex h-full w-full items-start justify-center overflow-y-auto">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className={cn(
                'relative z-10 mt-8 w-full max-w-lg transition-all duration-200 ease-out sm:mt-10',
                isOpen
                  ? 'translate-y-0 scale-100 opacity-100'
                  : 'translate-y-2 scale-[0.98] opacity-0',
              )}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={closeModal}
                aria-label={dict.subfeeds?.closeModalLabel || 'Close form modal'}
                className="absolute top-1 right-1 z-20"
              >
                <XIcon className="size-6" />
              </Button>

              <h3 id={titleId} className="sr-only">
                {dialogTitle}
              </h3>

              {form}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
