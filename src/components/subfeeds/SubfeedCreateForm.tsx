'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { createSubfeed, uploadSubfeedAvatar } from '@/app/actions/subfeeds'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function SubfeedCreateForm({ dict }: { dict: Record<string, any> }) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rules, setRules] = useState('')
  const [theme, setTheme] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  const copy = dict.subfeeds?.createForm || {}

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

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

      const created = await createSubfeed({
        name,
        description,
        rules,
        theme,
        avatarId,
      })

      toast.success(copy.createdToast || 'Subfeed created')
      router.push(`/subfeeds/${created.slug}`)
      router.refresh()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : copy.createError || 'Failed to create subfeed'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview)
      }
    }
  }, [avatarPreview])

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>{copy.title || 'Create a SubFeed'}</CardTitle>
        <CardDescription>
          {copy.description || 'Set up a focused community around a topic, hobby, or niche.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="name">
              {copy.nameLabel || 'Name'}
            </label>
            <Input
              id="name"
              placeholder={copy.namePlaceholder || 'e.g. Indie Web'}
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={3}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="description">
              {copy.descriptionLabel || 'Description'}
            </label>
            <Textarea
              id="description"
              placeholder={copy.descriptionPlaceholder || 'What is this SubFeed about?'}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              minLength={12}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="rules">
              {copy.rulesLabel || 'Rules'}
            </label>
            <Textarea
              id="rules"
              placeholder={
                copy.rulesPlaceholder ||
                'Keep discussions constructive, cite sources, no harassment...'
              }
              value={rules}
              onChange={(event) => setRules(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="avatar">
              {copy.imageLabel || 'Subfeed image (optional)'}
            </label>
            <Input
              id="avatar"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] || null
                setAvatarFile(file)

                if (avatarPreview) {
                  URL.revokeObjectURL(avatarPreview)
                }

                setAvatarPreview(file ? URL.createObjectURL(file) : null)
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
            <label className="text-sm font-medium" htmlFor="theme">
              {copy.themeLabel || 'Theme (optional)'}
            </label>
            <Input
              id="theme"
              placeholder={copy.themePlaceholder || 'e.g. minimal, editorial'}
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
            />
          </div>

          <Button disabled={isSubmitting} type="submit">
            {isSubmitting
              ? copy.creatingButton || 'Creating...'
              : copy.createButton || 'Create SubFeed'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
