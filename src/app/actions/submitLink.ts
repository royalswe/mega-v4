'use server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { revalidatePath } from 'next/cache'

import { headers } from 'next/headers'

export async function submitLink(values: {
  title: string
  url: string
  description?: string
  nsfw?: boolean
  type?: 'article' | 'video' | 'image' | 'audio' | 'game'
}) {
  const payload = await getPayload({
    config: configPromise,
  })

  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  if (!user) {
    throw new Error('You must be logged in to submit a link')
  }

  const userId = user.id

  await payload.create({
    collection: 'links',
    data: {
      ...values,
      user: userId,
      status: 'pending',
    },
    draft: true,
  })

  revalidatePath('/')
  revalidatePath('/submitted')
}
