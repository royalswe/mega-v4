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
import { Input } from '@/components/ui/input'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { submitPost } from '@/app/actions/posts'

export function PostSubmitForm({ dict }: { dict: Record<string, any> }) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formSchema = z.object({
    title: z.string().min(2, {
      message: 'Title is required (minimum 2 characters)',
    }),
    content: z.string().min(10, {
      message: 'Content is required (minimum 10 characters)',
    }),
    nsfw: z.boolean().optional(),
  })

  type FormSchema = z.infer<typeof formSchema>

  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      content: '',
      nsfw: false,
    },
  })

  async function onSubmit(values: FormSchema) {
    setIsSubmitting(true)
    try {
      await submitPost(values)
      toast.success('Post submitted successfully!')
      form.reset()
    } catch (error) {
      console.error(error)
      toast.error('Failed to submit post')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle>Create a Post</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Give your post a title" {...field} />
                  </FormControl>
                  <FormDescription>A catchy title helps people find your post</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <RichTextEditor
                      placeholder="Share your thoughts..."
                      onChange={field.onChange}
                      initialValue={field.value}
                      className="min-h-50"
                    />
                  </FormControl>
                  <FormDescription>What's on your mind? (Markdown supported)</FormDescription>
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
                    <FormLabel>Mark as NSFW</FormLabel>
                    <FormDescription>Check this if the post contains adult content</FormDescription>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Post'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
