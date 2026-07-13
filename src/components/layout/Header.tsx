import Link from 'next/link'
import { Menu } from 'lucide-react'

import { logout } from '@/app/actions/auth'
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
  const profileHref = user?.username ? `/user/${user.username}` : '/'

  return (
    <header className="border-b px-3 py-3 sm:px-6 sm:py-4">
      <div className="mx-auto flex w-full max-w-245 items-center justify-between gap-3">
        <div className="flex items-center gap-4 grow min-w-0">
          <h1 className="min-w-0 text-xl font-bold sm:text-2xl shrink-0">
            <Link href="/" className="inline-block truncate">
              MEGA <i>V4🔥</i>
            </Link>
          </h1>

          {/* Desktop Global Search Bar */}
          <form role="search" action="/search" method="get" className="hidden md:flex items-center relative max-w-xs grow">
            <input
              type="search"
              name="q"
              placeholder="Search..."
              className="flex h-9 w-full rounded-md border border-input bg-muted/20 px-3 py-1 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 focus:bg-background"
              aria-label="Search site"
              required
            />
          </form>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <LanguageSelector currentLang={lang} />
          <details className="relative">
            <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md border bg-muted/40 text-muted-foreground [&::-webkit-details-marker]:hidden">
              <Menu className="size-4" aria-hidden="true" />
              <span className="sr-only">Open menu</span>
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-md border bg-background p-3 shadow-md">
              <nav>
                {/* Mobile Global Search Bar */}
                <form role="search" action="/search" method="get" className="mb-3 flex items-center gap-2">
                  <input
                    type="search"
                    name="q"
                    placeholder="Search..."
                    className="flex h-8 w-full rounded-md border border-input bg-muted/20 px-2 py-1 text-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus:bg-background"
                    aria-label="Search site"
                    required
                  />
                  <Button type="submit" size="xs">Search</Button>
                </form>
                <ul className="space-y-1">
                  <li>
                    <Button variant="ghost" asChild className="w-full justify-start">
                      <Link href="/">{dict.menu.home}</Link>
                    </Button>
                  </li>
                  <li>
                    <Button variant="ghost" asChild className="w-full justify-start">
                      <Link href="/subfeeds">{dict.menu.subfeeds || 'SubFeeds'}</Link>
                    </Button>
                  </li>
                  <li>
                    <Button variant="ghost" asChild className="w-full justify-start">
                      <Link href="/wall">Wall</Link>
                    </Button>
                  </li>
                  <li>
                    <Button variant="ghost" asChild className="w-full justify-start">
                      <Link href="/new-link">{dict.menu.newLink}</Link>
                    </Button>
                  </li>
                  {canViewSubmitted ? (
                    <li>
                      <Button
                        variant="ghost"
                        asChild
                        className="w-full justify-start text-orange-400"
                      >
                        <Link href="/submitted">{dict.menu.submitted}</Link>
                      </Button>
                    </li>
                  ) : null}
                  {canModerate ? (
                    <li>
                      <Button
                        variant="ghost"
                        asChild
                        className="w-full justify-start text-orange-400"
                      >
                        <Link href="/moderation">{dict.menu.moderation || 'Moderation'}</Link>
                      </Button>
                    </li>
                  ) : null}
                </ul>

                <div className="mt-3 border-t pt-3">
                  {user ? (
                    <div className="space-y-2">
                      <Button variant="outline" asChild className="w-full justify-start">
                        <Link href={profileHref}>{dict.settings.profile || 'Profile'}</Link>
                      </Button>
                      <form action={logout}>
                        <Button type="submit" variant="outline" className="w-full justify-start">
                          {dict.menu.logout}
                        </Button>
                      </form>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Button variant="ghost" asChild className="w-full justify-start">
                        <Link href="/login">{dict.menu.login}</Link>
                      </Button>
                      <Button asChild className="w-full justify-start">
                        <Link href="/create-account">{dict.menu.signup}</Link>
                      </Button>
                    </div>
                  )}
                </div>
              </nav>
            </div>
          </details>
        </div>

        <nav className="hidden items-center gap-3 md:flex">
          <ul className="flex items-center gap-1">
            <li>
              <Button variant="ghost" asChild>
                <Link href="/">{dict.menu.home}</Link>
              </Button>
            </li>
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
            <li>
              <Button variant="ghost" asChild>
                <Link href="/new-link">{dict.menu.newLink}</Link>
              </Button>
            </li>
            {canViewSubmitted ? (
              <li>
                <Button variant="ghost" className="text-orange-400" asChild>
                  <Link href="/submitted">{dict.menu.submitted}</Link>
                </Button>
              </li>
            ) : null}
            {canModerate ? (
              <li>
                <Button variant="ghost" className="text-orange-400" asChild>
                  <Link href="/moderation">{dict.menu.moderation || 'Moderation'}</Link>
                </Button>
              </li>
            ) : null}
          </ul>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageSelector currentLang={lang} />
            {user ? (
              <UserMenu
                username={user.username}
                email={user.email}
                userMenuLabel={dict.menu.userMenu}
                profileLabel={dict.settings.profile || 'Profile'}
                logoutLabel={dict.menu.logout}
              />
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/login">{dict.menu.login}</Link>
                </Button>
                <Button asChild>
                  <Link href="/create-account">{dict.menu.signup}</Link>
                </Button>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
