import { redirect } from 'next/navigation'

import { SubfeedCreateForm } from '@/components/subfeeds/SubfeedCreateForm'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'

export default async function NewSubfeedPage() {
  const { user } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  if (!user) {
    redirect(
      `/login?error=${encodeURIComponent(dict.subfeeds?.loginRequiredToCreate || 'You must be logged in to create a subfeed')}`,
    )
  }

  return (
    <div className="py-10">
      <SubfeedCreateForm dict={dict} />
    </div>
  )
}
