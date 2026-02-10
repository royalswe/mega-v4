import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from './ThemeProvider'

import { Header } from '@/components/layout/Header'
import { Toaster } from '@/components/ui/sonner'

export const metadata: Metadata = {
  title: 'Existenz V4',
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
            <main className="grow w-full max-w-245 mx-auto py-8 px-2 sm:px-6">{children}</main>
            <footer className="py-4 px-6 border-t text-center text-sm text-muted-foreground">
              <p>&copy; Existenz V4. All rights reserved.</p>
            </footer>
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
