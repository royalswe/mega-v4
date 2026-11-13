import { LinkSubmitForm } from '@/components/links/LinkSubmitForm'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { loadPublishingDestinationEligibility } from '@/lib/community/subfeeds'

export default async function NewLinkPage() {
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  if (!user) {
    redirect(`/login?error=${encodeURIComponent('You must be logged in to submit a link')}`)
  }

  const eligibility = await loadPublishingDestinationEligibility(payload, user)

  return (
    <div className="py-10">
      <LinkSubmitForm
        dict={dict}
        subfeeds={eligibility.eligibleSubfeeds.map((subfeed) => ({
          id: subfeed.id,
          name: subfeed.name,
        }))}
        canPublishToMain={eligibility.canPublishToMain}
        defaultFeed={eligibility.defaultFeed}
      />
    </div>
  )
}
