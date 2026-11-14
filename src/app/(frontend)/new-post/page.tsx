import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { PostSubmitForm } from '@/components/posts/PostSubmitForm'
import { redirect } from 'next/navigation'
import { loadPublishingDestinationEligibility } from '@/lib/community/subfeeds'

export default async function NewPostPage() {
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  if (!user) {
    redirect('/login')
  }

  const eligibility = await loadPublishingDestinationEligibility(payload, user)

  return (
    <div className="space-y-4">
      <PostSubmitForm
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
