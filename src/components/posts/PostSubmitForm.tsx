'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { submitPost } from '@/app/actions/posts'
import type { AppDictionary } from '@/lib/dictionaries'
import type { SubmissionOutcome } from '@/lib/community/subfeeds'
import {
  getSubmissionOutcomeCopy,
  SubmissionOutcomeBanner,
} from '@/components/links/LinkSubmitForm'
import { SubmissionActionRow } from '@/components/subfeeds/SubmissionActionRow'
import { SubmissionDestinationFields } from '@/components/subfeeds/SubmissionDestinationFields'

interface SubfeedOption {
  id: number
  name: string
}

export function PostSubmitForm({
  dict,
  subfeeds,
  defaultSubfeedId,
  defaultFeed,
  canPublishToMain,
  lockDestination,
  onSuccess,
  onCancel,
}: {
  dict: AppDictionary
  subfeeds: SubfeedOption[]
  defaultSubfeedId?: number
  defaultFeed?: 'user' | 'main' | 'subfeed'
  canPublishToMain?: boolean
  lockDestination?: boolean
  onSuccess?: (outcome: SubmissionOutcome) => void
  onCancel?: () => void
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastOutcome, setLastOutcome] = useState<SubmissionOutcome | null>(null)
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null)

  const formSchema = z
    .object({
      title: z.string().min(2, {
        message: dict.postForm.titleRequired,
      }),
      content: z.string().min(10, {
        message: dict.postForm.contentRequired,
      }),
      nsfw: z.boolean().optional(),
      feed: z.enum(['user', 'main', 'subfeed']),
      subfeedId: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.feed === 'subfeed' && !data.subfeedId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['subfeedId'],
          message: dict.postForm.subfeedRequired,
        })
      }
    })

  type FormSchema = z.infer<typeof formSchema>

  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      content: '',
      nsfw: false,
      feed: defaultFeed ?? 'user',
      subfeedId: defaultSubfeedId ? String(defaultSubfeedId) : '',
    },
  })

  const selectedFeed = form.watch('feed')
  const feedOptions = [
    { value: 'user', label: dict.postForm.destinationOptions.user },
    ...(subfeeds.length > 0
      ? [{ value: 'subfeed', label: dict.postForm.destinationOptions.subfeed }]
      : []),
    ...(canPublishToMain ? [{ value: 'main', label: dict.postForm.destinationOptions.main }] : []),
  ]

  async function onSubmit(values: FormSchema) {
    setIsSubmitting(true)
    setSubmitErrorMessage(null)
    setLastOutcome(null)
    try {
      const outcome = await submitPost({
        title: values.title,
        content: values.content,
        nsfw: values.nsfw,
        feed: values.feed,
        subfeedId: values.subfeedId ? Number(values.subfeedId) : undefined,
      })
      const outcomeCopy = getSubmissionOutcomeCopy(dict, outcome)

      setLastOutcome(outcome)
      setSubmitErrorMessage(null)
      form.reset({
        title: '',
        content: '',
        nsfw: false,
        feed: defaultFeed ?? 'user',
        subfeedId: defaultSubfeedId ? String(defaultSubfeedId) : '',
      })

      if (outcome.isPublic) {
        toast.success(outcomeCopy.title)
      } else if (outcome.visibility === 'blocked') {
        toast.warning(outcomeCopy.title)
      } else {
        toast.info(outcomeCopy.title)
      }

      onSuccess?.(outcome)
    } catch (error) {
      console.error(error)
      const message =
        error instanceof Error && error.message ? error.message : dict.postForm.submitError
      setSubmitErrorMessage(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle>{dict.postForm.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {lastOutcome ? <SubmissionOutcomeBanner dict={dict} outcome={lastOutcome} /> : null}

        {submitErrorMessage ? (
          <Alert variant="destructive" data-testid="submission-error-alert" className="mb-6">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>{dict.postForm.submitError}</AlertTitle>
            <AlertDescription>{submitErrorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{dict.postForm.titleLabel}</FormLabel>
                  <FormControl>
                    <Input placeholder={dict.postForm.titlePlaceholder} {...field} />
                  </FormControl>
                  <FormDescription>{dict.postForm.titleDesc}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{dict.postForm.contentLabel}</FormLabel>
                  <FormControl>
                    <RichTextEditor
                      placeholder={dict.postForm.contentPlaceholder}
                      onChange={field.onChange}
                      initialValue={field.value}
                      className="min-h-50"
                    />
                  </FormControl>
                  <FormDescription>{dict.postForm.contentDesc}</FormDescription>
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
                destinationLabel: dict.postForm.destinationLabel,
                destinationPlaceholder: dict.postForm.destinationPlaceholder,
                destinationDesc: dict.postForm.destinationDesc,
                subfeedLabel: dict.postForm.subfeedLabel,
                subfeedPlaceholder: dict.postForm.subfeedPlaceholder,
                subfeedDesc: dict.postForm.subfeedDesc,
                noSubfeeds: dict.postForm.noSubfeeds,
                personalFeedOnlyNote: dict.postForm.personalFeedOnlyNote,
              }}
              feedOptions={feedOptions}
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
                    <FormLabel>{dict.postForm.nsfwLabel}</FormLabel>
                    <FormDescription>{dict.postForm.nsfwDesc}</FormDescription>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
            <SubmissionActionRow
              isSubmitting={isSubmitting}
              submitLabel={dict.postForm.submitButton}
              submittingLabel={dict.postForm.submitting}
              onCancel={onCancel}
              cancelLabel={dict.subfeeds.closeModalButton}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
