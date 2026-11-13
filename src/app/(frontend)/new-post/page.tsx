import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { PostSubmitForm } from '@/components/posts/PostSubmitForm'
import { redirect } from 'next/navigation'
import { getPublishingDestinationEligibility } from '@/lib/community/subfeeds'

export default async function NewPostPage() {
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  if (!user) {
    redirect('/login')
  }

  const { docs: subfeeds } = await payload.find({
    collection: 'subfeeds',
    sort: 'name',
    depth: 0,
    limit: 200,
    user,
    overrideAccess: false,
  })

  const eligibility = getPublishingDestinationEligibility(user, subfeeds)

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
