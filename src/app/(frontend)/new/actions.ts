'use server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { revalidatePath } from 'next/cache'

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

  let user = await payload.find({
    collection: 'users',
    where: {
      email: {
        equals: 'dev@example.com',
      },
    },
  })

  const userId = user.docs[0].id

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
