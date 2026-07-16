'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'

import type { AppDictionary } from '@/lib/dictionaries'
import { Button } from '@/components/ui/button'
import { Modal, ModalContent, ModalTitle } from '@/components/ui/modal'
import { LinkSubmitForm } from '@/components/links/LinkSubmitForm'

interface SubfeedOption {
  id: number
  name: string
}

interface QuickEditLinkButtonProps {
  dict: AppDictionary
  link: {
    id: number
    title: string
    url: string
    description?: string | null
    nsfw?: boolean | null
    type?: 'article' | 'video' | 'image' | 'audio' | 'game' | null
    feed?: 'main' | 'subfeed' | null
    subfeedId?: number
  }
  subfeeds: SubfeedOption[]
}

export function QuickEditLinkButton({ dict, link, subfeeds }: QuickEditLinkButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" variant="outline" size="xs" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
        Quick edit
      </Button>

      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <ModalTitle className="sr-only">Edit Link</ModalTitle>
          <LinkSubmitForm
            mode="edit"
            linkId={link.id}
            dict={dict}
            subfeeds={subfeeds}
            initialValues={{
              title: link.title,
              url: link.url,
              description: link.description ?? '',
              nsfw: link.nsfw ?? false,
              type: link.type ?? 'article',
              feed: link.feed ?? 'main',
              subfeedId: link.subfeedId,
            }}
            onSuccess={() => {
              setOpen(false)
              router.refresh()
            }}
            onCancel={() => setOpen(false)}
          />
        </ModalContent>
      </Modal>
    </>
  )
}
