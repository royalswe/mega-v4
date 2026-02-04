'use client'

import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export function ResetPasswordForm({ dict }: { dict: Record<string, any> }) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const resetPasswordSchema = z
    .object({
      password: z.string().min(4, dict.authForm.passwordRequired),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: dict.authForm.passwordMismatch,
      path: ['confirmPassword'],
    })

  type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  })

  async function onSubmit(data: ResetPasswordFormValues) {
    if (!token) {
      setError(dict.authForm.missingToken)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password: data.password,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.errors?.[0]?.message || json.message || 'Failed to reset password')
      }

      router.push(`/login?success=${encodeURIComponent(dict.authForm.resetSuccess)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.authForm.genericError)
    } finally {
      setIsLoading(false)
    }
  }

  if (!token) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>{dict.authForm.invalidTokenTitle}</CardTitle>
          <CardDescription>{dict.authForm.invalidTokenDesc}</CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-center text-sm text-muted-foreground">
          <Link href="/forgot-password" className="hover:text-primary underline underline-offset-4">
            {dict.authForm.requestNewLink}
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>{dict.authForm.resetPasswordTitle}</CardTitle>
        <CardDescription>{dict.authForm.resetPasswordDesc}</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{dict.authForm.errorTitle}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{dict.authForm.newPassword}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="********" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{dict.authForm.confirmPassword}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="********" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? dict.authForm.resetting : dict.authForm.resetPasswordButton}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
