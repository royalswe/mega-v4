'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedUser } from '@/lib/auth'

export async function submitComment(linkId: number, comment: string) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to comment')
  }

  const userId = user.id

  await payload.create({
    collection: 'comments',
    data: {
      link: linkId,
      user: userId,
      comment: JSON.parse(comment),
    },
  })

  revalidatePath(`/link/${linkId}`)
  revalidatePath('/')
}

export async function submitPostComment(postId: number, comment: string) {
  const { user, payload } = await getAuthenticatedUser()

  if (!user) {
    throw new Error('You must be logged in to comment')
  }

  const userId = user.id

  await payload.create({
    collection: 'comments',
    data: {
      post: postId,
      user: userId,
      comment: JSON.parse(comment),
    },
  })

  revalidatePath(`/post/${postId}`)
  revalidatePath('/wall')
}
