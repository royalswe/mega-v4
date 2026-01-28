import type { Metadata } from 'next'
import React from 'react'
import './globals.css'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Link Hub',
  description: 'A place to share and discover links.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <div className="flex flex-col min-h-screen">
          <header className="py-4 px-6 border-b flex items-center justify-between">
            <h1 className="text-2xl font-bold">
              <Link href="/">Link Hub</Link>
            </h1>
            <nav>
              <ul className="flex items-center space-x-4">
                <li>
                  <Button variant="ghost" asChild>
                    <Link href="/">Home</Link>
                  </Button>
                </li>
                <li>
                  <Button variant="ghost" asChild>
                    <Link href="/submitted">Submitted</Link>
                  </Button>
                </li>
                <li>
                  <Button variant="ghost" asChild>
                    <Link href="/new">New Link</Link>
                  </Button>
                </li>
              </ul>
            </nav>
          </header>
          <main className="grow container mx-auto py-8 px-6">{children}</main>
          <footer className="py-4 px-6 border-t text-center text-sm text-muted-foreground">
            <p>&copy; Link Hub. All rights reserved.</p>
          </footer>
        </div>
      </body>
    </html>
  )
}
