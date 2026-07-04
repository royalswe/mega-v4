'use server'

import crypto from 'crypto'
import { headers } from 'next/headers'

import { getAuthenticatedUser } from '@/lib/auth'

const isDuplicateClickError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false

  const maybe = error as any
  const code = typeof maybe.code === 'string' ? maybe.code : ''
  const message = typeof maybe.message === 'string' ? maybe.message : ''
  const name = typeof maybe.name === 'string' ? maybe.name : ''

  if (code === '23505' || /duplicate|unique/i.test(message)) {
    return true
  }

  // Handle Payload local-api ValidationError (v3) where details are nested under cause.errors.
  if (
    name === 'ValidationError' ||
    maybe.status === 400 ||
    maybe.cause?.name === 'ValidationError'
  ) {
    const errors = maybe.cause?.errors || maybe.errors || maybe.data?.errors
    if (Array.isArray(errors)) {
      return errors.some((err: any) => {
        const path = typeof err?.path === 'string' ? err.path : ''
        const field = typeof err?.field === 'string' ? err.field : ''
        const errorMessage = typeof err?.message === 'string' ? err.message : ''

        return (
          /identityKey/i.test(path) ||
          /identityKey/i.test(field) ||
          (/identityKey/i.test(`${path}.${field}`) && /duplicate|unique/i.test(errorMessage))
        )
      })
    }
  }

  return false
}

const createClickFingerprint = async (): Promise<string> => {
  const requestHeaders = await headers()
  const forwarded = requestHeaders.get('x-forwarded-for') || ''
  const ip = forwarded.split(',')[0]?.trim() || requestHeaders.get('x-real-ip') || 'unknown'
  const userAgent = requestHeaders.get('user-agent') || 'unknown'
  const acceptLanguage = requestHeaders.get('accept-language') || 'unknown'
  const salt = process.env.PAYLOAD_SECRET || 'link-click-salt'

  return crypto
    .createHash('sha256')
    .update(`${ip}|${userAgent}|${acceptLanguage}|${salt}`)
    .digest('hex')
}

export async function trackClick(linkId: number) {
  if (!Number.isInteger(linkId) || linkId <= 0) {
    return
  }

  const { payload, user } = await getAuthenticatedUser()

  try {
    const fingerprint = await createClickFingerprint()
    const identityKey = `link:${linkId}|fingerprint:${fingerprint}`

    // Unique identity key ensures one counted click per browser fingerprint per link.
    // The `links.clickCount` counter is incremented in the `link-clicks` afterChange hook,
    // keeping the trusted write inside the collection rather than this client-callable action.
    await payload.create({
      collection: 'link-clicks',
      data: {
        link: linkId,
        user: user?.id,
        fingerprint,
        identityKey,
      },
      overrideAccess: true,
    })

    // access revalidatePath inside the function to avoid static analysis issues if any
    const { revalidatePath } = await import('next/cache')
    revalidatePath('/')
  } catch (error) {
    if (isDuplicateClickError(error)) {
      return
    }

    console.error('Error tracking click:', error)
  }
}
