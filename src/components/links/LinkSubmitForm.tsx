'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Modal, ModalContent, ModalTitle, ModalDescription } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { getEmbedType } from '@/lib/media'
import { cn } from '@/lib/utils'
import { AlertTriangle, Check } from 'lucide-react'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { submitLink } from '@/app/actions/links'
import type { AppDictionary } from '@/lib/dictionaries'
import { SubmissionActionRow } from '@/components/subfeeds/SubmissionActionRow'
import { SubmissionDestinationFields } from '@/components/subfeeds/SubmissionDestinationFields'

interface SubfeedOption {
  id: number
  name: string
}

interface MediaSuggestion {
  url: string
  title?: string
  description?: string
  thumbnailUrl?: string
  provider?: 'youtube' | 'vimeo' | 'image'
}

interface LinkPreviewData {
  title?: string
  description?: string
  image?: string
  thumbnailUrl?: string
  provider?: 'youtube' | 'vimeo'
  providerName?: string
  authorName?: string
  readerText?: string
  embeddable?: boolean
  kind: ReturnType<typeof getEmbedType>['type']
}

export function LinkSubmitForm({
  dict,
  subfeeds,
  defaultSubfeedId,
  defaultFeed,
  lockDestination,
  onSuccess,
  onCancel,
}: {
  dict: AppDictionary
  subfeeds: SubfeedOption[]
  defaultSubfeedId?: number
  defaultFeed?: 'main' | 'subfeed'
  lockDestination?: boolean
  onSuccess?: () => void
  onCancel?: () => void
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  const formSchema = z
    .object({
      title: z.string().min(2, {
        message: dict.linkForm.titleRequired,
      }),
      url: z.url({ message: dict.linkForm.urlInvalid }),
      description: z.string().optional(),
      nsfw: z.boolean().optional(),
      type: z.enum(['article', 'video', 'image', 'audio', 'game']).optional(),
      feed: z.enum(['main', 'subfeed']),
      subfeedId: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.feed === 'subfeed' && !data.subfeedId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['subfeedId'],
          message: dict.linkForm.subfeedRequired,
        })
      }
    })

  type FormSchema = z.infer<typeof formSchema>

  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      url: '',
      description: '',
      nsfw: false,
      type: 'article',
      feed: defaultFeed ?? 'main',
      subfeedId: defaultSubfeedId ? String(defaultSubfeedId) : '',
    },
  })

  const selectedFeed = form.watch('feed')
  const lastPreviewedUrlRef = useRef('')

  const [isCheckingMedia, setIsCheckingMedia] = useState(false)
  const [suggestionState, setSuggestionState] = useState<{
    type: 'video' | 'image'
    originalUrl: string
    suggestedUrls: MediaSuggestion[]
  } | null>(null)
  const [selectedSuggestion, setSelectedSuggestion] = useState<string>('')
  const [linkPreview, setLinkPreview] = useState<LinkPreviewData | null>(null)
  const isSuggestionOpen = suggestionState !== null
  const isFormBusy = isSubmitting || isCheckingMedia || isSuggestionOpen

  function applyPreviewToFields(preview: LinkPreviewData, previewUrl: string) {
    if (form.getValues('url').trim() !== previewUrl) {
      return
    }

    setLinkPreview(preview)

    const titleValue = form.getValues('title') ?? ''
    const descriptionValue = form.getValues('description') ?? ''
    const typeValue = form.getValues('type') ?? 'article'

    if (preview.title && !form.getFieldState('title').isDirty && !titleValue.trim()) {
      form.setValue('title', preview.title, { shouldDirty: false, shouldTouch: false })
    }

    if (
      preview.description &&
      !form.getFieldState('description').isDirty &&
      !descriptionValue.trim()
    ) {
      form.setValue('description', preview.description, { shouldDirty: false, shouldTouch: false })
    }

    const resolvedType =
      preview.provider || preview.kind === 'video'
        ? 'video'
        : preview.kind === 'image'
          ? 'image'
          : preview.kind === 'audio'
            ? 'audio'
            : null

    if (resolvedType && !form.getFieldState('type').isDirty && typeValue === 'article') {
      form.setValue('type', resolvedType, { shouldDirty: false, shouldTouch: false })
    }
  }

  async function loadLinkPreview(url: string, options?: { force?: boolean }) {
    const normalizedUrl = url.trim()
    if (!normalizedUrl) {
      setLinkPreview(null)
      return null
    }

    if (!options?.force && lastPreviewedUrlRef.current === normalizedUrl && linkPreview) {
      return linkPreview
    }

    let embedInfo
    try {
      embedInfo = getEmbedType(normalizedUrl)
    } catch {
      return null
    }

    if (embedInfo.type === 'image' || embedInfo.type === 'video' || embedInfo.type === 'audio') {
      const preview = {
        kind: embedInfo.type,
        embeddable: true,
      } satisfies LinkPreviewData

      lastPreviewedUrlRef.current = normalizedUrl
      applyPreviewToFields(preview, normalizedUrl)
      return preview
    }

    setIsLoadingPreview(true)
    try {
      const res = await fetch(`/api/check-embed?url=${encodeURIComponent(normalizedUrl)}`)
      const data = await res.json()
      const preview: LinkPreviewData = {
        title: data.title,
        description: data.description,
        image: data.image,
        thumbnailUrl: data.thumbnailUrl,
        provider: data.provider,
        providerName: data.providerName,
        authorName: data.authorName,
        readerText: data.readerText,
        embeddable: data.embeddable,
        kind: embedInfo.type,
      }

      lastPreviewedUrlRef.current = normalizedUrl
      applyPreviewToFields(preview, normalizedUrl)
      return preview
    } catch (error) {
      console.error('Failed to load link preview', error)
      return null
    } finally {
      setIsLoadingPreview(false)
    }
  }

  async function proceedSubmit(values: FormSchema) {
    setIsSubmitting(true)
    try {
      await submitLink({
        title: values.title,
        url: values.url,
        description: values.description,
        nsfw: values.nsfw,
        type: values.type,
        feed: values.feed,
        subfeedId: values.subfeedId ? Number(values.subfeedId) : undefined,
      })
      toast.success(dict.linkForm.submitSuccess)
      form.reset({
        title: '',
        url: '',
        description: '',
        nsfw: false,
        type: 'article',
        feed: defaultFeed ?? 'main',
        subfeedId: defaultSubfeedId ? String(defaultSubfeedId) : '',
      })
      setLinkPreview(null)
      lastPreviewedUrlRef.current = ''
      onSuccess?.()
    } catch (error) {
      console.error(error)
      toast.error(dict.linkForm.submitError)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function onSubmit(values: FormSchema) {
    if (isCheckingMedia || suggestionState) {
      return
    }

    await loadLinkPreview(values.url, { force: true })
    const latestValues = form.getValues()
    const latestUrl = latestValues.url.trim()

    const isVideo = latestValues.type === 'video'
    const isImage = latestValues.type === 'image'

    if (!isVideo && !isImage) {
      await proceedSubmit(latestValues)
      return
    }

    // Check if the current URL is directly previewable
    const embedInfo = getEmbedType(latestUrl)
    const isValidVideo = isVideo && embedInfo.type !== 'iframe'
    const isValidImage = isImage && embedInfo.type === 'image'

    if (isValidVideo || isValidImage) {
      await proceedSubmit(latestValues)
      return
    }

    // Not direct, let's scan the target page for matching direct media links
    setIsCheckingMedia(true)
    try {
      const res = await fetch(
        `/api/scrape-media?url=${encodeURIComponent(values.url)}&type=${values.type}`,
      )
      const data = await res.json()

      if (
        data.success &&
        Array.isArray(data.suggestionDetails) &&
        data.suggestionDetails.length > 0
      ) {
        setSuggestionState({
          type: latestValues.type as 'video' | 'image',
          originalUrl: latestUrl,
          suggestedUrls: data.suggestionDetails,
        })
        setSelectedSuggestion(data.suggestionDetails[0].url)
      } else {
        // No direct media links found, proceed submitting the original URL
        await proceedSubmit(latestValues)
      }
    } catch (err) {
      console.error('Failed to verify media link', err)
      // Scraping failed, proceed submitting the original URL as fallback
      await proceedSubmit(latestValues)
    } finally {
      setIsCheckingMedia(false)
    }
  }

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle>{dict.linkForm.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <fieldset disabled={isFormBusy} className="space-y-8">
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{dict.linkForm.urlLabel}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={dict.linkForm.urlPlaceholder}
                        {...field}
                        onBlur={async (event) => {
                          field.onBlur()
                          await loadLinkPreview(event.target.value)
                        }}
                      />
                    </FormControl>
                    <FormDescription>{dict.linkForm.urlDesc}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {(linkPreview || isLoadingPreview) && (
                <div className="rounded-xl border bg-muted/20 p-3">
                  {isLoadingPreview ? (
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <div className="h-10 w-10 animate-pulse rounded-md bg-muted" />
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">Loading link preview</p>
                        <p>Checking the URL and preparing autofill suggestions.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                        {linkPreview?.image ? (
                          <img
                            src={linkPreview.image}
                            alt={linkPreview.title || 'Link preview'}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="px-2 text-center text-xs text-muted-foreground">
                            No thumbnail available
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {linkPreview?.providerName ||
                            (linkPreview?.provider === 'youtube'
                              ? 'YouTube'
                              : linkPreview?.provider === 'vimeo'
                                ? 'Vimeo'
                                : 'Preview')}
                        </div>
                        <p className="truncate font-medium">
                          {linkPreview?.title || 'Preview ready'}
                        </p>
                        {linkPreview?.description && (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {linkPreview.description}
                          </p>
                        )}
                        {linkPreview?.authorName && (
                          <p className="text-xs text-muted-foreground">
                            By {linkPreview.authorName}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{dict.linkForm.titleLabel}</FormLabel>
                    <FormControl>
                      <Input placeholder={dict.linkForm.titlePlaceholder} {...field} />
                    </FormControl>
                    <FormDescription>{dict.linkForm.titleDesc}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{dict.linkForm.descLabel}</FormLabel>
                    <FormControl>
                      <Input placeholder={dict.linkForm.descPlaceholder} {...field} />
                    </FormControl>
                    <FormDescription>{dict.linkForm.descDesc}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{dict.linkForm.typeLabel}</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-100">
                          <SelectValue placeholder={dict.linkForm.typePlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="article">{dict.linkForm.types.article}</SelectItem>
                          <SelectItem value="video">{dict.linkForm.types.video}</SelectItem>
                          <SelectItem value="image">{dict.linkForm.types.image}</SelectItem>
                          <SelectItem value="audio">{dict.linkForm.types.audio}</SelectItem>
                          <SelectItem value="game">{dict.linkForm.types.game}</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <SubmissionDestinationFields
                form={form}
                feedName="feed"
                subfeedIdName="subfeedId"
                selectedFeed={selectedFeed}
                lockDestination={lockDestination}
                defaultFeed={defaultFeed}
                subfeeds={subfeeds}
                labels={{
                  destinationLabel: dict.linkForm.destinationLabel,
                  destinationPlaceholder: dict.linkForm.destinationPlaceholder,
                  destinationDesc: dict.linkForm.destinationDesc,
                  subfeedLabel: dict.linkForm.subfeedLabel,
                  subfeedPlaceholder: dict.linkForm.subfeedPlaceholder,
                  subfeedDesc: dict.linkForm.subfeedDesc,
                  noSubfeeds: dict.linkForm.noSubfeeds,
                }}
                feedOptions={[
                  { value: 'main', label: dict.linkForm.destinationOptions.main },
                  { value: 'subfeed', label: dict.linkForm.destinationOptions.subfeed },
                ]}
              />
              <FormField
                control={form.control}
                name="nsfw"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>{dict.linkForm.nsfwLabel}</FormLabel>
                      <FormDescription>{dict.linkForm.nsfwDesc}</FormDescription>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />
              <SubmissionActionRow
                isSubmitting={isFormBusy}
                submitLabel={
                  isCheckingMedia ? dict.linkForm.checkingLink : dict.linkForm.submitButton
                }
                submittingLabel={
                  isCheckingMedia ? dict.linkForm.scanningSite : dict.linkForm.submitting
                }
                onCancel={onCancel}
                cancelLabel={dict.linkForm.cancelButton}
              />
            </fieldset>
          </form>
        </Form>
      </CardContent>

      {/* Suggest direct media link modal */}
      {suggestionState && (
        <Modal
          open={suggestionState !== null}
          onOpenChange={(open) => {
            if (!open) setSuggestionState(null)
          }}
        >
          <ModalContent className="max-w-md p-6 flex flex-col gap-4 border bg-background rounded-xl shadow-lg">
            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <ModalTitle className="text-lg font-semibold">
                {dict.linkForm.suggestionModalTitle}
              </ModalTitle>
            </div>
            <ModalDescription className="text-sm text-muted-foreground">
              {dict.linkForm.suggestionModalDescription.replace('{type}', suggestionState.type)}
            </ModalDescription>

            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto border rounded-lg p-2 bg-muted/20">
              {suggestionState.suggestedUrls.map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedSuggestion(suggestion.url)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md border text-xs transition-colors',
                    selectedSuggestion === suggestion.url
                      ? 'bg-primary/10 border-primary text-foreground font-semibold'
                      : 'bg-background hover:bg-muted border-input text-muted-foreground',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-24 shrink-0 overflow-hidden rounded-md border bg-muted/40">
                      {suggestion.thumbnailUrl ? (
                        <img
                          src={suggestion.thumbnailUrl}
                          alt={suggestion.title || suggestion.url}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-muted-foreground">
                          No thumbnail
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {suggestion.title || suggestion.url}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{suggestion.url}</p>
                    </div>
                    {selectedSuggestion === suggestion.url && (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <Button
                type="button"
                disabled={!selectedSuggestion}
                onClick={async () => {
                  await loadLinkPreview(selectedSuggestion, { force: true })
                  const updatedValues = { ...form.getValues(), url: selectedSuggestion }
                  setSuggestionState(null)
                  setSelectedSuggestion('')
                  await proceedSubmit(updatedValues)
                }}
                className="w-full"
              >
                {dict.linkForm.useSuggestedUrlButton}
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await loadLinkPreview(form.getValues('url'), { force: true })
                    await proceedSubmit(form.getValues())
                    setSuggestionState(null)
                    setSelectedSuggestion('')
                  }}
                  className="flex-1"
                >
                  {dict.linkForm.keepOriginalButton}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setSuggestionState(null)
                    setSelectedSuggestion('')
                  }}
                  className="flex-1"
                >
                  {dict.linkForm.cancelButton}
                </Button>
              </div>
            </div>
          </ModalContent>
        </Modal>
      )}
    </Card>
  )
}
