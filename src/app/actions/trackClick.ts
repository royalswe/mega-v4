'use server'

import { getPayload } from 'payload'
import configPromise from '@payload-config'

export async function trackClick(linkId: number) {
  const payload = await getPayload({ config: configPromise })

  try {
    const link = await payload.findByID({
      collection: 'links',
      id: linkId,
      overrideAccess: false,
    })

    if (!link) return

    await payload.update({
      collection: 'links',
      id: linkId,
      data: {
        clickCount: (link.clickCount || 0) + 1,
      },
      overrideAccess: true,
    })

    // access revalidatePath inside the function to avoid static analysis issues if any
    const { revalidatePath } = await import('next/cache')
    revalidatePath('/')
  } catch (error) {
    console.error('Error tracking click:', error)
  }
}
