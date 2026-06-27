'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LogOut, User } from 'lucide-react'

import { logout } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type UserMenuProps = {
  username?: string | null
  email?: string | null
  userMenuLabel: string
  profileLabel: string
  logoutLabel: string
}

export function UserMenu({
  username,
  email,
  userMenuLabel,
  profileLabel,
  logoutLabel,
}: UserMenuProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const displayName = username || email || 'User'
  const profileHref = username ? `/user/${username}` : '/'

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label={userMenuLabel}>
        <User className="h-[1.2rem] w-[1.2rem]" />
        <span className="sr-only">{userMenuLabel}</span>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <User className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">{userMenuLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem className="font-medium" asChild>
          <Link href={profileHref}>{displayName}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={profileHref}>{profileLabel}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={logout} className="w-full">
            <button className="flex w-full items-center text-red-400" type="submit">
              <LogOut className="mr-2 h-4 w-4" />
              <span>{logoutLabel}</span>
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
