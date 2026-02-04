import type { Metadata } from 'next'
import './globals.css'
import React from 'react'
import { ThemeProvider } from './ThemeProvider'

import { Header } from '@/components/layout/Header'
import { Toaster } from '@/components/ui/sonner'

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
            <main className="grow w-full max-w-[1140px] mx-auto py-8 px-2 sm:px-6">{children}</main>
            <footer className="py-4 px-6 border-t text-center text-sm text-muted-foreground">
              <p>&copy; Link Hub. All rights reserved.</p>
            </footer>
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
