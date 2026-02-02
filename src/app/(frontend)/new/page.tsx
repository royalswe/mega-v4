import { LinkSubmitForm } from '@/components/links/LinkSubmitForm'
import { redirect } from 'next/navigation'
import React from 'react'
import { getAuthenticatedUser } from '@/lib/auth'

export default async function NewLinkPage() {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    redirect('/login?error=You must be logged in to submit a link')
  }

  return (
    <div className="py-10">
      <LinkSubmitForm />
    </div>
  )
}
