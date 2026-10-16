import { beforeEach, describe, expect, it } from 'vitest'
import { clearPosPreferences, DEFAULT_POS_PREFERENCES, readPosPreferences, writePosPreferences } from './pos-preferences'

describe('POS preferences', () => {
  beforeEach(() => localStorage.clear())

  it('uses safe defaults and isolates preferences by connection', () => {
    expect(readPosPreferences('one')).toEqual(DEFAULT_POS_PREFERENCES)
    writePosPreferences('one', { ...DEFAULT_POS_PREFERENCES, profileName: 'Caja principal', defaultCustomer: 'CUST-001' })
    expect(readPosPreferences('one').profileName).toBe('Caja principal')
    expect(readPosPreferences('two')).toEqual(DEFAULT_POS_PREFERENCES)
  })

  it('normalizes malformed data and supports reset', () => {
    localStorage.setItem('mauricio-erpnext:pos-preferences:one', '{bad')
    expect(readPosPreferences('one')).toEqual(DEFAULT_POS_PREFERENCES)
    writePosPreferences('one', { ...DEFAULT_POS_PREFERENCES, rememberCustomer: false })
    clearPosPreferences('one')
    expect(readPosPreferences('one')).toEqual(DEFAULT_POS_PREFERENCES)
  })
})
