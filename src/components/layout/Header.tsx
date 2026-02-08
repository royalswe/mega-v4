import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/app/(frontend)/ThemeToggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { LanguageSelector } from './LanguageSelector'
import { User, LogOut } from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'

export async function Header() {
  const { user } = await getAuthenticatedUser()
  const { dict, lang } = await getDictionary()

  return (
    <header className="py-4 px-6 border-b flex items-center justify-between">
      <h1 className="text-2xl font-bold">
        <Link href="/">Link Hub</Link>
      </h1>
      <nav className="flex items-center space-x-4">
        <ul className="flex items-center space-x-4">
          <li>
            <Button variant="ghost" asChild>
              <Link href="/">{dict.menu.home}</Link>
            </Button>
          </li>
          <li>
            <Button variant="ghost" asChild>
              <Link href="/submitted">{dict.menu.submitted}</Link>
            </Button>
          </li>
          <li>
            <Button variant="ghost" asChild>
              <Link href="/new-link">{dict.menu.newLink}</Link>
            </Button>
          </li>
        </ul>

        <div className="flex items-center space-x-2">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <User className="h-[1.2rem] w-[1.2rem]" />
                  <span className="sr-only">{dict.menu.userMenu}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem className="font-medium" asChild>
                  <Link href={`/user/${user.username}`}>{user.username || user.email}</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={`/user/${user.username}`}>{dict.settings.profile || 'Profile'}</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <form action={logout} className="w-full">
                    <button className="flex w-full items-center text-red-400">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>{dict.menu.logout}</span>
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center space-x-2">
              <Button variant="ghost" asChild>
                <Link href="/login">{dict.menu.login}</Link>
              </Button>
              <Button asChild>
                <Link href="/create-account">{dict.menu.signup}</Link>
              </Button>
              <ThemeToggle />
              <LanguageSelector currentLang={lang} />
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}
