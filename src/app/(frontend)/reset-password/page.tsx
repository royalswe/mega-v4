import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import React, { Suspense } from 'react'

export default function ResetPasswordPage() {
  return (
    <div className="py-10">
      <Suspense fallback={<div>Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  )
}
