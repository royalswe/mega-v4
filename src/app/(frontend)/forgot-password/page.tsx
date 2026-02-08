import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { getDictionary } from '@/lib/dictionaries'

export default async function ForgotPasswordPage() {
  const { dict } = await getDictionary()

  return (
    <div className="py-10">
      <ForgotPasswordForm dict={dict} />
    </div>
  )
}
