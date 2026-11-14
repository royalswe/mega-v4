import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * The Community Wall has been merged into the Main Feed (`/`), which now shows
 * links and discussions together. Keep this route so old links still resolve.
 */
export default function WallPage() {
  redirect('/')
}
