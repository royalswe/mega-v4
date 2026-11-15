'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface HeaderNavLinkProps {
  href: string
  children: React.ReactNode
  mobile?: boolean
  className?: string
}

export function HeaderNavLink({ href, children, mobile = false, className }: HeaderNavLinkProps) {
  const pathname = usePathname()
  const isActive =
    href === '/' ? pathname === '/' : pathname === href || pathname?.startsWith(`${href}/`)

  return (
    <Button
      variant="ghost"
      asChild
      className={cn(
        mobile && 'w-full justify-start',
        isActive && 'bg-muted font-semibold text-foreground',
        className,
      )}
    >
      <Link href={href} aria-current={isActive ? 'page' : undefined}>
        {children}
      </Link>
    </Button>
  )
}
