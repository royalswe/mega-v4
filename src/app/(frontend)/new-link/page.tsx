import { LinkSubmitForm } from '@/components/links/LinkSubmitForm'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { canModerateCommunity, isSubfeedMemberOrModerator } from '@/lib/community/subfeeds'

export default async function NewLinkPage() {
  const { user, payload } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  if (!user) {
    redirect(`/login?error=${encodeURIComponent('You must be logged in to submit a link')}`)
  }

  const { docs: subfeeds } = await payload.find({
    collection: 'subfeeds',
    sort: 'name',
    depth: 0,
    limit: 200,
    user,
    overrideAccess: false,
  })

  const availableSubfeeds = canModerateCommunity(user)
    ? subfeeds
    : subfeeds.filter((subfeed) => isSubfeedMemberOrModerator(subfeed, user.id))

  return (
    <div className="py-10">
      <LinkSubmitForm
        dict={dict}
        subfeeds={availableSubfeeds.map((subfeed) => ({
          id: subfeed.id,
          name: subfeed.name,
        }))}
      />
    </div>
  )
}
