import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import React, { Suspense } from 'react'
import { getDictionary } from '@/lib/dictionaries'

export default async function ResetPasswordPage() {
  const { dict } = await getDictionary()

  return (
    <div className="py-10">
      <Suspense fallback={<div>Loading...</div>}>
        <ResetPasswordForm dict={dict} />
      </Suspense>
    </div>
  )
}
