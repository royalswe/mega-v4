'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { XIcon } from 'lucide-react'

import { LinkSubmitForm } from '@/components/links/LinkSubmitForm'
import { PostSubmitForm } from '@/components/posts/PostSubmitForm'
import { Button } from '@/components/ui/button'
import { Modal, ModalClose, ModalContent, ModalTitle, ModalTrigger } from '@/components/ui/modal'
import type { AppDictionary } from '@/lib/dictionaries'

interface Props {
  subfeedId: number
  subfeedName: string
  mode: 'link' | 'post'
  dict: AppDictionary
}

export function SubfeedCreatePanel({ subfeedId, subfeedName, mode, dict }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const subfeedOption = { id: subfeedId, name: subfeedName }
  const label = mode === 'link' ? dict.subfeeds.submitLink : dict.subfeeds.createPost

  const dialogTitle =
    mode === 'link'
      ? `${dict.subfeeds.submitLinkModalTitle}: ${subfeedName}`
      : `${dict.subfeeds.createPostModalTitle}: ${subfeedName}`

  function handleSuccess() {
    setOpen(false)
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
        onCancel={() => setOpen(false)}
      />
    ) : (
      <PostSubmitForm
        dict={dict}
        subfeeds={[subfeedOption]}
        defaultSubfeedId={subfeedId}
        defaultFeed="subfeed"
        lockDestination
        onSuccess={handleSuccess}
        onCancel={() => setOpen(false)}
      />
    )

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>
        <Button variant="outline" size="sm">
          + {label}
        </Button>
      </ModalTrigger>

      <ModalContent className="max-w-lg border-0 bg-transparent p-0 shadow-none">
        <ModalTitle className="sr-only">{dialogTitle}</ModalTitle>

        <ModalClose asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={dict.subfeeds.closeModalLabel}
            className="absolute top-1 right-1 z-20"
          >
            <XIcon className="size-6" />
          </Button>
        </ModalClose>

        {form}
      </ModalContent>
    </Modal>
  )
}
