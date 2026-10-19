import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_APP_PREFERENCES, normalizeAppPreferences, readAppPreferences, writeAppPreferences } from './app-preferences'

describe('app preferences', () => {
  beforeEach(() => localStorage.clear())

  it('normalizes invalid values to safe defaults', () => {
    expect(normalizeAppPreferences({ landingRoute: '/unknown', density: 'wide', sidebarCollapsed: 'yes' })).toEqual(DEFAULT_APP_PREFERENCES)
  })

  it('migrates the legacy collapsed sidebar preference', () => {
    localStorage.setItem('mauricio-erpnext:sidebar-collapsed', 'true')
    expect(readAppPreferences().sidebarCollapsed).toBe(true)
  })

  it('writes normalized preferences and keeps the legacy key in sync', () => {
    const saved = writeAppPreferences({ ...DEFAULT_APP_PREFERENCES, landingRoute: '/pos', sidebarCollapsed: true, density: 'compact' })
    expect(saved.landingRoute).toBe('/pos')
    expect(saved.density).toBe('compact')
    expect(localStorage.getItem('mauricio-erpnext:sidebar-collapsed')).toBe('true')
    expect(readAppPreferences()).toEqual(saved)
  })
})
