'use server'

import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'

export async function submitComment(linkId: number, comment: string) {
  const payload = await getPayload({
    config: configPromise,
  })

  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  if (!user) {
    throw new Error('You must be logged in to comment')
  }

  const userId = user.id

  await payload.create({
    collection: 'comments',
    data: {
      link: linkId,
      user: userId,
      comment,
    },
  })

  revalidatePath(`/link/${linkId}`)
  revalidatePath('/')
}
