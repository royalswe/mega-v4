'use server'

import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { revalidatePath } from 'next/cache'

export async function submitComment(linkId: number, comment: string) {
  const payload = await getPayload({
    config: configPromise,
  })

  // For now, we'll use the hardcoded dev user
  const { docs: users } = await payload.find({
    collection: 'users',
    where: {
      email: {
        equals: 'admin@mail.com',
      },
    },
  })

  if (users.length === 0) {
    throw new Error('User not found')
  }

  const userId = users[0].id

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
