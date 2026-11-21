import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_APP_PREFERENCES, writeAppPreferences } from './app-preferences'
import { localSessionExpiresAt } from './session'

describe('local session expiration', () => {
  beforeEach(() => localStorage.clear())

  it('uses the 12 hour default when creating a session', () => {
    expect(localSessionExpiresAt(1_000)).toBe(1_000 + 12 * 60 * 60 * 1000)
  })

  it('uses the configured duration for the next session', () => {
    writeAppPreferences({ ...DEFAULT_APP_PREFERENCES, sessionDurationHours: 8 })
    expect(localSessionExpiresAt(1_000)).toBe(1_000 + 8 * 60 * 60 * 1000)
  })
})
