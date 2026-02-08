import { useRouter } from 'next/navigation'
import { updateLanguage } from '@/app/actions/settings'
import { useTransition } from 'react'

export function useLanguageChange() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleLanguageChange = (
    lang: 'en' | 'sv',
    onSuccess?: () => void,
    onError?: (err: unknown) => void,
  ) => {
    startTransition(async () => {
      try {
        document.cookie = `lang=${lang}; path=/; max-age=31536000`
        await updateLanguage(lang)
        router.refresh()
        onSuccess?.()
      } catch (error) {
        onError?.(error)
      }
    })
  }

  return { handleLanguageChange, isPending }
}
