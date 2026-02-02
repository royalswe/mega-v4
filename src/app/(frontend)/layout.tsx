import type { Metadata } from 'next'
import React from 'react'
import './globals.css'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ThemeProvider } from './ThemeProvider'
import { ThemeToggle } from './ThemeToggle'

import { Header } from '@/components/layout/Header'

export const metadata: Metadata = {
  title: 'Link Hub',
  description: 'A place to share and discover links.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex flex-col min-h-screen">
            <Header />
            <main className="grow container mx-auto py-8 px-6">{children}</main>
            <footer className="py-4 px-6 border-t text-center text-sm text-muted-foreground">
              <p>&copy; Link Hub. All rights reserved.</p>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
