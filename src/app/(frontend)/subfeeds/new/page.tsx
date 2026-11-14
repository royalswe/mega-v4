import { redirect } from 'next/navigation'

import { SubfeedCreateForm } from '@/components/subfeeds/SubfeedCreateForm'
import { SubfeedEligibilityGate } from '@/components/subfeeds/SubfeedEligibilityGate'
import { getAuthenticatedUser } from '@/lib/auth'
import { getSubfeedEligibilityForUser } from '@/lib/community/subfeedEligibility'
import { getDictionary } from '@/lib/dictionaries'

export default async function NewSubfeedPage() {
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  if (!user) {
    redirect(
      `/login?error=${encodeURIComponent(dict.subfeeds?.loginRequiredToCreate || 'You must be logged in to create a subfeed')}`,
    )
  }

  const eligibility = await getSubfeedEligibilityForUser(payload, user.id)

  return (
    <div className="py-10">
      {eligibility && !eligibility.eligible ? (
        <SubfeedEligibilityGate
          eligibility={eligibility}
          dict={dict}
          userFeedHref={`/user/${encodeURIComponent(user.username)}`}
        />
      ) : (
        <SubfeedCreateForm dict={dict} />
      )}
    </div>
  )
}
