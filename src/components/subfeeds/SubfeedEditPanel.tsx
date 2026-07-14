'use client'

import { useState } from 'react'
import { Pencil, XIcon } from 'lucide-react'

import { SubfeedEditForm } from '@/components/subfeeds/SubfeedEditForm'
import { Button } from '@/components/ui/button'
import { Modal, ModalClose, ModalContent, ModalTitle, ModalTrigger } from '@/components/ui/modal'
import type { AppDictionary } from '@/lib/dictionaries'

interface Props {
  dict: AppDictionary
  subfeed: {
    id: number
    slug: string
    name: string
    description: string
    rules?: string | null
    theme?: string | null
    avatarUrl?: string | null
  }
}

export function SubfeedEditPanel({ dict, subfeed }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit SubFeed
        </Button>
      </ModalTrigger>

      <ModalContent className="max-w-lg border-0 bg-transparent p-0 shadow-none">
        <ModalTitle className="sr-only">Edit SubFeed: {subfeed.name}</ModalTitle>

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

        <SubfeedEditForm
          dict={dict}
          subfeed={subfeed}
          onSuccess={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </ModalContent>
    </Modal>
  )
}
