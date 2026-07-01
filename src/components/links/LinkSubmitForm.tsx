'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { useState } from 'react'
import { toast } from 'sonner'
import { Modal, ModalContent, ModalTitle, ModalDescription } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { getEmbedType } from '@/components/links/LinkPreviewModal'
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

  const [isCheckingMedia, setIsCheckingMedia] = useState(false)
  const [suggestionState, setSuggestionState] = useState<{
    type: 'video' | 'image'
    originalUrl: string
    suggestedUrls: string[]
    values: FormSchema
  } | null>(null)
  const [selectedSuggestion, setSelectedSuggestion] = useState<string>('')

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
      onSuccess?.()
    } catch (error) {
      console.error(error)
      toast.error(dict.linkForm.submitError)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function onSubmit(values: FormSchema) {
    const isVideo = values.type === 'video'
    const isImage = values.type === 'image'

    if (!isVideo && !isImage) {
      await proceedSubmit(values)
      return
    }

    // Check if the current URL is directly previewable
    const embedInfo = getEmbedType(values.url)
    const isValidVideo = isVideo && embedInfo.type !== 'iframe'
    const isValidImage = isImage && embedInfo.type === 'image'

    if (isValidVideo || isValidImage) {
      await proceedSubmit(values)
      return
    }

    // Not direct, let's scan the target page for matching direct media links
    setIsCheckingMedia(true)
    try {
      const res = await fetch(
        `/api/scrape-media?url=${encodeURIComponent(values.url)}&type=${values.type}`,
      )
      const data = await res.json()

      if (data.success && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setSuggestionState({
          type: values.type as 'video' | 'image',
          originalUrl: values.url,
          suggestedUrls: data.suggestions,
          values,
        })
        setSelectedSuggestion(data.suggestions[0])
      } else {
        // No direct media links found, proceed submitting the original URL
        await proceedSubmit(values)
      }
    } catch (err) {
      console.error('Failed to verify media link', err)
      // Scraping failed, proceed submitting the original URL as fallback
      await proceedSubmit(values)
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
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{dict.linkForm.urlLabel}</FormLabel>
                  <FormControl>
                    <Input placeholder={dict.linkForm.urlPlaceholder} {...field} />
                  </FormControl>
                  <FormDescription>{dict.linkForm.urlDesc}</FormDescription>
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
              render={() => (
                <FormItem>
                  <FormLabel>{dict.linkForm.typeLabel}</FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={form.setValue.bind(null, 'type')}
                      defaultValue={form.getValues().type}
                    >
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
              isSubmitting={isSubmitting || isCheckingMedia}
              submitLabel={isCheckingMedia ? 'Checking Link...' : dict.linkForm.submitButton}
              submittingLabel={isCheckingMedia ? 'Scanning Site...' : dict.linkForm.submitting}
              onCancel={onCancel}
              cancelLabel={dict.subfeeds.closeModalButton}
            />
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
              <ModalTitle className="text-lg font-semibold">Direct Link Suggestion</ModalTitle>
            </div>
            <ModalDescription className="text-sm text-muted-foreground">
              This URL is not a direct {suggestionState.type} address. We scanned the page and found
              these direct resource paths instead:
            </ModalDescription>

            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto border rounded-lg p-2 bg-muted/20">
              {suggestionState.suggestedUrls.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedSuggestion(url)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md border text-xs font-mono break-all flex items-center justify-between transition-colors',
                    selectedSuggestion === url
                      ? 'bg-primary/10 border-primary text-foreground font-semibold'
                      : 'bg-background hover:bg-muted border-input text-muted-foreground',
                  )}
                >
                  <span className="truncate max-w-[90%]">{url}</span>
                  {selectedSuggestion === url && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <Button
                type="button"
                disabled={!selectedSuggestion}
                onClick={() => {
                  const updatedValues = { ...suggestionState.values, url: selectedSuggestion }
                  setSuggestionState(null)
                  setSelectedSuggestion('')
                  proceedSubmit(updatedValues)
                }}
                className="w-full"
              >
                Use Suggested URL & Submit
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    proceedSubmit(suggestionState.values)
                    setSuggestionState(null)
                    setSelectedSuggestion('')
                  }}
                  className="flex-1"
                >
                  Keep Original
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
                  Cancel
                </Button>
              </div>
            </div>
          </ModalContent>
        </Modal>
      )}
    </Card>
  )
}
