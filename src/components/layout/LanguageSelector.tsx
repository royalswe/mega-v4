'use client'
import type { User } from '@/payload-types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { updateLanguage } from '@/app/actions/settings'

type UserLanguage = NonNullable<NonNullable<User['settings']>['language']>

export function LanguageSelector({ currentLang }: { currentLang: UserLanguage }) {
  const router = useRouter()
  const handleLanguageChange = async (lang: UserLanguage) => {
    document.cookie = `lang=${lang}; path=/; max-age=31536000`
    try {
      // Update DB (no-op if user is not logged in)
      await updateLanguage(lang)
    } catch (error) {
      console.error('Failed to update language preference:', error)
    }
    router.refresh()
  }

  const flags: Record<UserLanguage, string> = {
    en: '🇺🇸',
    sv: '🇸🇪',
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="w-9 px-0" aria-label="Select language">
          <span className="text-xl" aria-hidden="true">
            {flags[currentLang]}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleLanguageChange('en')}>
          <span className="mr-2" aria-label="English">
            🇺🇸
          </span>
          English
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleLanguageChange('sv')}>
          <span className="mr-2" aria-label="Svenska">
            🇸🇪
          </span>
          Svenska
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
