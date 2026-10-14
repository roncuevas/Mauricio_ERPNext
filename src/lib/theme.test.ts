import { beforeEach, describe, expect, it } from 'vitest'
import { applyColorMode, applyTheme, COLOR_MODE_STORAGE_KEY, DEFAULT_THEME, isColorMode, isThemeId, readColorMode, readTheme, saveColorMode, saveTheme, THEME_STORAGE_KEY } from './theme'

describe('theme preferences', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-color-mode')
  })

  it('uses the ERP blue theme by default', () => {
    expect(readTheme()).toBe(DEFAULT_THEME)
  })

  it('rejects unknown theme ids and preserves valid ids', () => {
    expect(isThemeId('natural-emerald')).toBe(true)
    expect(isThemeId('unknown-theme')).toBe(false)
    localStorage.setItem(THEME_STORAGE_KEY, 'unknown-theme')
    expect(readTheme()).toBe(DEFAULT_THEME)
  })

  it('saves and applies a selected theme', () => {
    saveTheme('premium-violet')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('premium-violet')
    expect(document.documentElement.dataset.theme).toBe('premium-violet')
    expect(readTheme()).toBe('premium-violet')
  })

  it('applies a theme without changing unrelated document state', () => {
    document.title = 'Mauricio ERPNext'
    applyTheme('minimal-graphite')
    expect(document.documentElement.dataset.theme).toBe('minimal-graphite')
    expect(document.title).toBe('Mauricio ERPNext')
  })

  it('reads, saves, and applies dark mode', () => {
    expect(readColorMode()).toBe('light')
    expect(isColorMode('dark')).toBe(true)
    expect(isColorMode('sepia')).toBe(false)
    saveColorMode('dark')
    expect(localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.dataset.colorMode).toBe('dark')
    expect(readColorMode()).toBe('dark')
    applyColorMode('light')
    expect(document.documentElement.dataset.colorMode).toBe('light')
  })
})
