'use client'

import * as React from 'react'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
  attribute?: 'class'
  storageKey?: string
}

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

const resolveTheme = (theme: Theme, enableSystem: boolean): ResolvedTheme => {
  if (theme !== 'system' || !enableSystem) {
    return theme === 'dark' ? 'dark' : 'light'
  }

  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const applyResolvedTheme = (theme: ResolvedTheme) => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(theme)
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  enableSystem = true,
  storageKey = 'theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>('light')

  React.useEffect(() => {
    const stored = window.localStorage.getItem(storageKey)
    const nextTheme =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : defaultTheme

    setThemeState(nextTheme)
  }, [defaultTheme, storageKey])

  React.useEffect(() => {
    const nextResolved = resolveTheme(theme, enableSystem)
    setResolvedTheme(nextResolved)
    applyResolvedTheme(nextResolved)

    if (theme) {
      window.localStorage.setItem(storageKey, theme)
    }

    if (theme !== 'system' || !enableSystem) return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const systemResolved = mediaQuery.matches ? 'dark' : 'light'
      setResolvedTheme(systemResolved)
      applyResolvedTheme(systemResolved)
    }

    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [enableSystem, storageKey, theme])

  const setTheme = React.useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }

  return context
}
