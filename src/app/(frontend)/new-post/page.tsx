import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { PostSubmitForm } from '@/components/posts/PostSubmitForm'
import { redirect } from 'next/navigation'

export default async function NewPostPage() {
  const { user } = await getAuthenticatedUser()
  const { dict } = await getDictionary()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="space-y-4">
      <PostSubmitForm dict={dict} />
    </div>
  )
}
