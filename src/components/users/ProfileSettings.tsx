'use client'

import type { UserLanguage } from '@/lib/dictionaries'
import type { User } from '@/payload-types'

import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

import { toggleNSFW } from '@/app/actions/settings'
import { ThemeToggle } from '@/app/(frontend)/ThemeToggle'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { startTransition } from 'react'
import { LanguageSelector } from '../layout/LanguageSelector'

interface ProfileSettingsProps {
  user: User
  currentUser: User | null
  dict: Record<string, any>
  lang: UserLanguage
}

export function ProfileSettings({ user, currentUser, dict, lang }: ProfileSettingsProps) {
  const isOwner = currentUser?.id === user.id

  const router = useRouter()

  if (!isOwner) return null

  const handleNSFWChange = (checked: boolean) => {
    startTransition(async () => {
      try {
        await toggleNSFW(checked)
        toast.success(checked ? dict.settings.nsfwEnabled : dict.settings.nsfwDisabled)
        router.refresh()
      } catch (error) {
        console.error(error)
        toast.error(dict.settings.updateError)
      }
    })
  }

  return (
    <div className="space-y-6 mt-8 border-t pt-8">
      <h2 className="text-xl font-bold">{dict.menu.settings || 'Settings'}</h2>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="nsfw-mode">{dict.settings.showNSFW}</Label>
            <p className="text-sm text-muted-foreground">
              {dict.settings.nsfwDescription || 'Show content marked as NSFW'}
            </p>
          </div>
          <Switch
            id="nsfw-mode"
            checked={user.settings?.nsfw || false}
            onCheckedChange={handleNSFWChange}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="language">{dict.settings.language || 'Language'}</Label>
            <p className="text-sm text-muted-foreground">
              {dict.settings.languageDescription || 'Select your preferred language'}
            </p>
          </div>
          <LanguageSelector currentLang={user?.settings?.language || lang} />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="theme">{dict.settings.theme || 'Theme'}</Label>
            <p className="text-sm text-muted-foreground">
              {dict.settings.themeDescription || 'Toggle between light and dark mode'}
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}
