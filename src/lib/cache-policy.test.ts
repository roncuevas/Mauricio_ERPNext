import { describe, expect, it } from 'vitest'
import { cacheStatusLabel, getCacheStatus } from './cache-policy'

describe('cache policy', () => {
  it('classifies missing, fresh, and stale local data', () => {
    const now = Date.parse('2026-10-16T12:00:00.000Z')
    expect(getCacheStatus('catalog', null, now)).toBe('missing')
    expect(getCacheStatus('catalog', { updatedAt: '2026-10-16T11:45:00.000Z' }, now)).toBe('fresh')
    expect(getCacheStatus('catalog', { updatedAt: '2026-10-16T10:00:00.000Z' }, now)).toBe('stale')
  })

  it('returns Spanish status labels', () => {
    expect(cacheStatusLabel('fresh')).toBe('vigente')
    expect(cacheStatusLabel('stale')).toContain('refresca')
    expect(cacheStatusLabel('missing')).toBe('sin caché')
  })

  it('uses dedicated TTLs for operational caches', () => {
    const now = Date.parse('2026-10-16T12:00:00.000Z')
    expect(getCacheStatus('shifts', { updatedAt: '2026-10-16T11:57:00.000Z' }, now)).toBe('fresh')
    expect(getCacheStatus('shifts', { updatedAt: '2026-10-16T11:54:00.000Z' }, now)).toBe('stale')
  })
})
