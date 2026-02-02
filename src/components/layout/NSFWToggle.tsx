'use client'

import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toggleNSFW } from '@/app/actions/settings'
import { useTransition, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export function NSFWToggle({ initialValue }: { initialValue: boolean }) {
  const [enabled, setEnabled] = useState(initialValue)
  const [isPending, startTransition] = useTransition()

  const handleToggle = (checked: boolean) => {
    setEnabled(checked)
    startTransition(async () => {
      try {
        await toggleNSFW(checked)
        toast.success(`NSFW content ${checked ? 'enabled' : 'disabled'}`)
      } catch (error) {
        console.error(error)
        setEnabled(!checked) // Revert on error
        toast.error('Failed to update setting')
      }
    })
  }

  return (
    <div className="flex items-center space-x-2 px-2 py-1.5 cursor-default select-none rounded-sm text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 w-full justify-between">
      <Label htmlFor="nsfw-mode" className="cursor-pointer flex-grow">
        Show NSFW
      </Label>
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Switch id="nsfw-mode" checked={enabled} onCheckedChange={handleToggle} />
      )}
    </div>
  )
}
