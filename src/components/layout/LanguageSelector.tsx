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
    // Set cookie
    document.cookie = `lang=${lang}; path=/; max-age=31536000`
    // Update DB if user is logged in

    await updateLanguage(lang)
    router.refresh()
  }

  const flags: Record<UserLanguage, string> = {
    en: '🇺🇸',
    sv: '🇸🇪',
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="w-9 px-0">
          <span className="text-xl" aria-label="Toggle language">
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
