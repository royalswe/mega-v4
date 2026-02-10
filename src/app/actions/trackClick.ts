'use server'

import { getPayload } from 'payload'
import configPromise from '@payload-config'

export async function trackClick(linkId: number) {
  const payload = await getPayload({ config: configPromise })

  try {
    const link = await payload.findByID({
      collection: 'links',
      id: linkId,
    })
    console.log(linkId, link)

    if (!link) return

    await payload.update({
      collection: 'links',
      id: linkId,
      data: {
        clickCount: (link.clickCount || 0) + 1,
      },
    })

    // access revalidatePath inside the function to avoid static analysis issues if any
    const { revalidatePath } = await import('next/cache')
    revalidatePath('/')
  } catch (error) {
    console.error('Error tracking click:', error)
  }
}
