'use client'

import { User } from '@/payload-types'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toggleNSFW, updateLanguage } from '@/app/actions/settings'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface ProfileSettingsProps {
  user: User
  currentUser: User | null
  dict: Record<string, any>
}

export function ProfileSettings({ user, currentUser, dict }: ProfileSettingsProps) {
  const isOwner = currentUser?.id === user.id
  const [isPending, startTransition] = useTransition()
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

  const handleLanguageChange = (value: string) => {
    startTransition(async () => {
      try {
        await updateLanguage(value as 'en' | 'sv')
        document.cookie = `lang=${value}; path=/; max-age=31536000`
        toast.success(dict.settings.languageUpdated || 'Language updated')
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
            disabled={isPending}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="language">{dict.settings.language || 'Language'}</Label>
            <p className="text-sm text-muted-foreground">
              {dict.settings.languageDescription || 'Select your preferred language'}
            </p>
          </div>
          <Select
            value={user.settings?.language || 'en'}
            onValueChange={handleLanguageChange}
            disabled={isPending}
          >
            <SelectTrigger className="w-[180px]" id="language">
              <SelectValue placeholder="Select Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English 🇺🇸</SelectItem>
              <SelectItem value="sv">Svenska 🇸🇪</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
