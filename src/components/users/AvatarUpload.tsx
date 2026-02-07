'use client'

import { useState, useRef, useTransition, useEffect } from 'react'
import { Upload, X, Loader2 } from 'lucide-react'
import { Avatar } from './Avatar'
import { uploadMedia, updateUserAvatar } from '@/app/actions/users'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { User } from '@/payload-types'

interface AvatarUploadProps {
  user: User
  dict: Record<string, any>
}

export function AvatarUpload({ user, dict }: AvatarUploadProps) {
  const [isPending, startTransition] = useTransition()
  const [preview, setPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Revoke the previous preview URL if it exists
    if (preview) {
      URL.revokeObjectURL(preview)
    }

    // Create local preview
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)

    // Automatically start upload
    handleUpload(file, objectUrl)
  }

  const handleUpload = (file: File, objectUrl: string) => {
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append('file', file)

        const media = await uploadMedia(formData)
        await updateUserAvatar(media.id)

        toast.success(dict.profile?.avatarUpdated || 'Avatar updated successfully')
        router.refresh()
        setPreview(null)
      } catch (error) {
        console.error(error)
        toast.error(dict.profile?.avatarUpdateError || 'Failed to update avatar')
        setPreview(null)
      } finally {
        // Revoke the object URL after upload is complete
        URL.revokeObjectURL(objectUrl)
      }
    })
  }

  // Cleanup effect to revoke the preview URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview)
      }
    }
  }, [preview])

  return (
    <div className="flex items-center gap-4">
      <div className="relative group">
        <div className="relative h-24 w-24">
          {preview ? (
            <img
              src={preview}
              alt="Preview"
              className="h-full w-full rounded-full object-cover border-2 border-primary"
            />
          ) : (
            <Avatar user={user} className="h-24 w-24 text-4xl" />
          )}

          {isPending && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center rounded-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
        </div>

        <label
          htmlFor="avatar-upload"
          className={`
                absolute bottom-0 right-0 p-1 bg-primary text-primary-foreground rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow-sm
                ${isPending ? 'pointer-events-none opacity-50' : ''}
            `}
        >
          <Upload className="h-4 w-4" />
          <span className="sr-only">Upload avatar</span>
        </label>

        <input
          id="avatar-upload"
          type="file"
          accept="image/*"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileSelect}
          disabled={isPending}
        />
      </div>

      <div>
        <h3 className="font-semibold text-lg">{user.username}</h3>
        <p className="text-sm text-muted-foreground">
          {dict.profile?.changeAvatar || 'Click the upload icon to change your avatar'}
        </p>
      </div>
    </div>
  )
}
