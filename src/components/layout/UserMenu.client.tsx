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
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    const fetchUnreadCount = async () => {
      try {
        const res = await fetch('/api/messages/unread-count')
        if (res.ok) {
          const data = await res.json()
          setUnreadCount(data.count || 0)
        }
      } catch (err) {
        console.error('Failed to fetch unread count:', err)
      }
    }

    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 15000)
    return () => clearInterval(interval)
  }, [mounted])

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
        <Button variant="ghost" size="icon" className="relative">
          <User className="h-[1.2rem] w-[1.2rem]" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-background animate-pulse">
              {unreadCount}
            </span>
          )}
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
