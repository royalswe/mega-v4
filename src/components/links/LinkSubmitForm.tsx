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

  async function onSubmit(values: FormSchema) {
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
              isSubmitting={isSubmitting}
              submitLabel={dict.linkForm.submitButton}
              submittingLabel={dict.linkForm.submitting}
              onCancel={onCancel}
              cancelLabel={dict.subfeeds.closeModalButton}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
