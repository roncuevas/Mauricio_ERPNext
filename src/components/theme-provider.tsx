/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { applyColorMode, applyTheme, DEFAULT_THEME, readColorMode, readTheme, saveColorMode, saveTheme, themes, type ColorMode, type ThemeId } from '../lib/theme'

type ThemeContextValue = {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  colorMode: ColorMode
  toggleColorMode: () => void
  themes: typeof themes
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => readTheme())
  const [colorMode, setColorMode] = useState<ColorMode>(() => readColorMode())

  useEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => { applyColorMode(colorMode) }, [colorMode])

  const value = useMemo(() => ({
    theme,
    setTheme: (nextTheme: ThemeId) => { saveTheme(nextTheme); setThemeState(nextTheme) },
    colorMode,
    toggleColorMode: () => setColorMode((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      saveColorMode(next)
      return next
    }),
    themes,
  }), [colorMode, theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider')
  return context
}

export function initializeTheme() {
  applyTheme(readTheme() || DEFAULT_THEME)
  applyColorMode(readColorMode())
}
