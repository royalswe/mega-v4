import { RegisterForm } from '@/components/auth/RegisterForm'
import React from 'react'
import { getDictionary } from '@/lib/dictionaries'

export default async function CreateAccountPage() {
  const { dict } = await getDictionary()

  return (
    <div className="py-10">
      <RegisterForm dict={dict} />
    </div>
  )
}
