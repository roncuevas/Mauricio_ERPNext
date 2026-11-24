import { beforeEach, describe, expect, it } from 'vitest'
import { readPendingPreferences, writePendingPreferences } from './pending-preferences'

describe('pending preferences', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to 25 results per page and keeps only the offered sizes', () => {
    expect(readPendingPreferences('p').pageSize).toBe(25)
    localStorage.setItem('mauricio-erpnext:pending-preferences:p', JSON.stringify({ pageSize: 37 }))
    expect(readPendingPreferences('p').pageSize).toBe(25)
    writePendingPreferences('p', { ...readPendingPreferences('p'), pageSize: 100 })
    expect(readPendingPreferences('p').pageSize).toBe(100)
  })
})
