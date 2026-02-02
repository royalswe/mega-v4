import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/app/(frontend)/ThemeToggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { User, LogOut } from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { getAuthenticatedUser } from '@/lib/auth'

export async function Header() {
  const { user } = await getAuthenticatedUser()

  return (
    <header className="py-4 px-6 border-b flex items-center justify-between">
      <h1 className="text-2xl font-bold">
        <Link href="/">Link Hub</Link>
      </h1>
      <nav className="flex items-center space-x-4">
        <ul className="flex items-center space-x-4">
          <li>
            <Button variant="ghost" asChild>
              <Link href="/">Home</Link>
            </Button>
          </li>
          <li>
            <Button variant="ghost" asChild>
              <Link href="/submitted">Submitted</Link>
            </Button>
          </li>
          <li>
            <Button variant="ghost" asChild>
              <Link href="/new">New Link</Link>
            </Button>
          </li>
        </ul>

        <div className="flex items-center space-x-2">
          <ThemeToggle />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <User className="h-[1.2rem] w-[1.2rem]" />
                  <span className="sr-only">User menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="font-medium">
                  {user.username || user.email}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <form action={logout} className="w-full">
                    <button className="flex w-full items-center text-red-600">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center space-x-2">
              <Button variant="ghost" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link href="/create-account">Sign up</Link>
              </Button>
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}
