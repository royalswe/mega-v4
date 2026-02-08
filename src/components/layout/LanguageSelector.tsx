'use client'
import type { User } from '@/payload-types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useLanguageChange } from '@/components/users/useLanguageChange'

type UserLanguage = NonNullable<NonNullable<User['settings']>['language']>

export function LanguageSelector({ currentLang }: { currentLang: UserLanguage }) {
  const { handleLanguageChange } = useLanguageChange()
  const handleChange = (lang: UserLanguage) => {
    handleLanguageChange(lang, undefined, (error) => {
      console.error('Failed to update language preference:', error)
    })
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
        <DropdownMenuItem onClick={() => handleChange('en')}>
          <span className="mr-2" aria-label="English">
            🇺🇸
          </span>
          English
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleChange('sv')}>
          <span className="mr-2" aria-label="Svenska">
            🇸🇪
          </span>
          Svenska
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
