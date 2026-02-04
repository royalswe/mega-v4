'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { submitComment } from '@/app/actions/comments'
import Link from 'next/link'
import { toast } from 'sonner'

const formSchema = z.object({
  comment: z.string().min(1, {
    message: 'Comment cannot be empty.',
  }),
})

export function CommentForm({
  linkId,
  userId,
  dict,
}: {
  linkId: number
  userId?: string | number | null
  dict: Record<string, any>
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      comment: '',
    },
  })

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true)
    try {
      await submitComment(linkId, values.comment)
      toast.success(dict.common.commentAdded)
      form.reset()
    } catch (error) {
      console.error(error)
      toast.error(dict.common.failedToAddComment)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!userId) {
    return (
      <div className="p-4 border rounded-md bg-muted text-muted-foreground text-center">
        <p>
          <Link href="/login" className="underline hover:text-foreground">
            {dict.common.loginToComment}
          </Link>{' '}
        </p>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="comment"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Add a comment</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="What are your thoughts?"
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </Button>
      </form>
    </Form>
  )
}
