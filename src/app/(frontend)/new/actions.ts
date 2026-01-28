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

  let userId: number

  if (user.docs.length > 0) {
    userId = user.docs[0].id
  } else {
    const newUser = await payload.create({
      collection: 'users',
      data: {
        email: 'dev@example.com',
        password: 'password',
        name: 'Dev User',
      },
    })
    userId = newUser.id
  }

  await payload.create({
    collection: 'links',
    data: {
      ...values,
      user: userId,
      status: 'pending',
    },
  })

  revalidatePath('/')
  revalidatePath('/submitted')
}
