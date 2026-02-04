import { LoginForm } from '@/components/auth/LoginForm'
import React from 'react'
import { getDictionary } from '@/lib/dictionaries'

export default async function LoginPage() {
  const { dict } = await getDictionary()

  return (
    <div className="py-10">
      <LoginForm dict={dict} />
    </div>
  )
}
