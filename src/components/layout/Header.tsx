import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/app/(frontend)/ThemeToggle'
import { LanguageSelector } from './LanguageSelector'
import { UserMenu } from './UserMenu.client'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDictionary } from '@/lib/dictionaries'
import { checkRole } from '@/access/checkRole'
import { canManageSubmittedLinks } from '@/lib/community/subfeeds'

export async function Header() {
  const { user } = await getAuthenticatedUser()
  const { dict, lang } = await getDictionary()
  const canModerate = user ? checkRole(['admin', 'moderator', 'editor'], user) : false
  const canViewSubmitted = user ? canManageSubmittedLinks(user) : false

  return (
    <header className="py-4 px-6 border-b flex items-center justify-between">
      <h1 className="text-2xl font-bold">
        <Link href="/">
          Existenz <i>V4🔥</i>
        </Link>
      </h1>
      <nav className="flex items-center space-x-4">
        <ul className="flex items-center space-x-4">
          <li>
            <Button variant="ghost" asChild>
              <Link href="/">{dict.menu.home}</Link>
            </Button>
          </li>
          {canViewSubmitted ? (
            <li>
              <Button variant="ghost" asChild>
                <Link href="/submitted">{dict.menu.submitted}</Link>
              </Button>
            </li>
          ) : null}
          <li>
            <Button variant="ghost" asChild>
              <Link href="/subfeeds">{dict.menu.subfeeds || 'SubFeeds'}</Link>
            </Button>
          </li>
          <li>
            <Button variant="ghost" asChild>
              <Link href="/wall">Wall</Link>
            </Button>
          </li>
          {canModerate ? (
            <li>
              <Button variant="ghost" asChild>
                <Link href="/moderation">{dict.menu.moderation || 'Moderation'}</Link>
              </Button>
            </li>
          ) : null}
          <li>
            <Button variant="ghost" asChild>
              <Link href="/new-link">{dict.menu.newLink}</Link>
            </Button>
          </li>
        </ul>

        <div className="flex items-center space-x-2">
          {user ? (
            <UserMenu
              username={user.username}
              email={user.email}
              userMenuLabel={dict.menu.userMenu}
              profileLabel={dict.settings.profile || 'Profile'}
              logoutLabel={dict.menu.logout}
            />
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
