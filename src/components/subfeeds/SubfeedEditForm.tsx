'use client'

import type { AppDictionary } from '@/lib/dictionaries'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { updateSubfeed, uploadSubfeedAvatar } from '@/app/actions/subfeeds'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type SubfeedEditDictionary = AppDictionary & {
  subfeeds: AppDictionary['subfeeds'] & {
    createForm: AppDictionary['subfeeds']['createForm'] & {
      imageLabel?: string
      imagePreviewAlt?: string
      imageHelp?: string
    }
  }
}

interface Props {
  dict: SubfeedEditDictionary
  subfeed: {
    id: number
    slug: string
    name: string
    description: string
    rules?: string | null
    theme?: string | null
    avatarUrl?: string | null
  }
  onSuccess?: () => void
  onCancel?: () => void
}

export function SubfeedEditForm({ dict, subfeed, onSuccess, onCancel }: Props) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [name, setName] = useState(subfeed.name)
  const [description, setDescription] = useState(subfeed.description)
  const [rules, setRules] = useState(subfeed.rules || '')
  const [theme, setTheme] = useState(subfeed.theme || '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(subfeed.avatarUrl || null)

  const copy = dict.subfeeds?.createForm || {}

  const onSubmit = async () => {
    setIsSubmitting(true)

    try {
      let avatarId: number | undefined

      if (avatarFile) {
        const formData = new FormData()
        formData.append('file', avatarFile)
        formData.append('subfeedName', name)
        const media = await uploadSubfeedAvatar(formData)
        avatarId = media.id
      }

      const updated = await updateSubfeed({
        subfeedId: subfeed.id,
        name,
        description,
        rules,
        theme,
        avatarId,
      })

      toast.success('Subfeed updated')

      if (updated.slug !== subfeed.slug) {
        router.push(`/subfeeds/${updated.slug}`)
      }
      router.refresh()
      onSuccess?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update subfeed'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    return () => {
      if (avatarPreview && avatarFile) {
        URL.revokeObjectURL(avatarPreview)
      }
    }
  }, [avatarPreview, avatarFile])

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Edit SubFeed</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void onSubmit()
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="edit-name">
              {copy.nameLabel || 'Name'}
            </label>
            <Input
              id="edit-name"
              placeholder={copy.namePlaceholder || 'e.g. Indie Web'}
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={3}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="edit-description">
              {copy.descriptionLabel || 'Description'}
            </label>
            <Textarea
              id="edit-description"
              placeholder={copy.descriptionPlaceholder || 'What is this SubFeed about?'}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              minLength={12}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="edit-rules">
              {copy.rulesLabel || 'Rules'}
            </label>
            <Textarea
              id="edit-rules"
              placeholder={
                copy.rulesPlaceholder ||
                'Keep discussions constructive, cite sources, no harassment...'
              }
              value={rules}
              onChange={(event) => setRules(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="edit-avatar">
              {copy.imageLabel || 'Subfeed image (optional)'}
            </label>
            <Input
              id="edit-avatar"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] || null
                setAvatarFile(file)

                if (avatarPreview && avatarFile) {
                  URL.revokeObjectURL(avatarPreview)
                }

                setAvatarPreview(file ? URL.createObjectURL(file) : subfeed.avatarUrl || null)
              }}
            />
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt={copy.imagePreviewAlt || 'Subfeed image preview'}
                className="h-16 w-16 rounded-full border object-cover"
              />
            ) : null}
            <p className="text-xs text-muted-foreground">
              {copy.imageHelp || 'Shown on links and the subfeed list.'}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="edit-theme">
              {copy.themeLabel || 'Theme (optional)'}
            </label>
            <Input
              id="edit-theme"
              placeholder={copy.themePlaceholder || 'e.g. minimal, editorial'}
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving...' : 'Save changes'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                {dict.subfeeds.closeModalButton || 'Close'}
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
