import { describe, expect, it } from 'vitest'
import { relativeAge } from './relative-time'

describe('relativeAge', () => {
  const now = Date.parse('2026-11-22T12:00:00Z')
  it('formats past timestamps in the largest whole unit', () => {
    expect(relativeAge('2026-11-22T10:00:00Z', 'en', now)).toBe('2 hours ago')
    expect(relativeAge('2026-11-20T12:00:00Z', 'en', now)).toBe('2 days ago')
  })
  it('returns undefined for missing or invalid values', () => {
    expect(relativeAge(undefined, 'es')).toBeUndefined()
    expect(relativeAge('not a date', 'es')).toBeUndefined()
  })
})
