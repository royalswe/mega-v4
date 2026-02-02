import { LinkSubmitForm } from '@/components/links/LinkSubmitForm'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import React from 'react'

export default async function NewLinkPage() {
  const headersList = await headers()
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: headersList })

  if (!user) {
    redirect('/login?error=You must be logged in to submit a link')
  }

  return (
    <div className="py-10">
      <LinkSubmitForm />
    </div>
  )
}
