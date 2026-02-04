'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
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

export function LinkSubmitForm({ dict }: { dict: Record<string, any> }) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formSchema = z.object({
    title: z.string().min(2, {
      message: dict.linkForm.titleRequired,
    }),
    url: z.url({ message: dict.linkForm.urlInvalid }),
    description: z.string().optional(),
    nsfw: z.boolean().optional(),
    type: z.enum(['article', 'video', 'image', 'audio', 'game']).optional(),
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
    },
  })

  async function onSubmit(values: FormSchema) {
    setIsSubmitting(true)
    try {
      await submitLink(values)
      toast.success(dict.linkForm.submitSuccess)
      form.reset()
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? dict.linkForm.submitting : dict.linkForm.submitButton}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
