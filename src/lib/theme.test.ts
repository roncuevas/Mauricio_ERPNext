import { beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, DEFAULT_THEME, isThemeId, readTheme, saveTheme, THEME_STORAGE_KEY } from './theme'

describe('theme preferences', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
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
})
