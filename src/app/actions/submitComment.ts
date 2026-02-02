'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedUser } from '@/lib/auth'

export async function submitComment(linkId: number, comment: string) {
    const { user, payload } = await getAuthenticatedUser()

  await payload.create({
    collection: 'comments',
    data: {
      link: linkId,
      user: user.id,
      comment,
    },
  })

  revalidatePath(`/link/${linkId}`)
  revalidatePath('/')
}
