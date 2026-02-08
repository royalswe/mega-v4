import { LinkSubmitForm } from '@/components/links/LinkSubmitForm'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'

export default async function NewLinkPage() {
  const { user } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  if (!user) {
    redirect(`/login?error=${encodeURIComponent('You must be logged in to submit a link')}`)
  }

  return (
    <div className="py-10">
      <LinkSubmitForm dict={dict} />
    </div>
  )
}
