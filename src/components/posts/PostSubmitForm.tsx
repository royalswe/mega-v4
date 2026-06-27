'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { submitPost } from '@/app/actions/posts'
import type { AppDictionary } from '@/lib/dictionaries'
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
  lockDestination,
  onSuccess,
  onCancel,
}: {
  dict: AppDictionary
  subfeeds: SubfeedOption[]
  defaultSubfeedId?: number
  defaultFeed?: 'user' | 'subfeed'
  lockDestination?: boolean
  onSuccess?: () => void
  onCancel?: () => void
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formSchema = z
    .object({
      title: z.string().min(2, {
        message: dict.postForm.titleRequired,
      }),
      content: z.string().min(10, {
        message: dict.postForm.contentRequired,
      }),
      nsfw: z.boolean().optional(),
      feed: z.enum(['user', 'subfeed']),
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

  async function onSubmit(values: FormSchema) {
    setIsSubmitting(true)
    try {
      await submitPost({
        title: values.title,
        content: values.content,
        nsfw: values.nsfw,
        feed: values.feed,
        subfeedId: values.subfeedId ? Number(values.subfeedId) : undefined,
      })
      toast.success(dict.postForm.submitSuccess)
      form.reset({
        title: '',
        content: '',
        nsfw: false,
        feed: defaultFeed ?? 'user',
        subfeedId: defaultSubfeedId ? String(defaultSubfeedId) : '',
      })
      onSuccess?.()
    } catch (error) {
      console.error(error)
      toast.error(dict.postForm.submitError)
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
              }}
              feedOptions={[
                { value: 'user', label: dict.postForm.destinationOptions.user },
                { value: 'subfeed', label: dict.postForm.destinationOptions.subfeed },
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
