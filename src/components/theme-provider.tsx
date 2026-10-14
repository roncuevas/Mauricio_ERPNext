/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { applyTheme, DEFAULT_THEME, readTheme, saveTheme, themes, type ThemeId } from '../lib/theme'

type ThemeContextValue = {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  themes: typeof themes
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => readTheme())

  useEffect(() => { applyTheme(theme) }, [theme])

  const value = useMemo(() => ({
    theme,
    setTheme: (nextTheme: ThemeId) => { saveTheme(nextTheme); setThemeState(nextTheme) },
    themes,
  }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider')
  return context
}

export function initializeTheme() {
  applyTheme(readTheme() || DEFAULT_THEME)
}
