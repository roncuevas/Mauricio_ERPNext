import { describe, expect, it } from 'vitest'
import { latestModified, mergeIncrementalRows } from './incremental-sync'

describe('latestModified', () => {
  it('returns the newest server modified value', () => {
    expect(latestModified([{ modified: '2026-11-22 09:30:00.000000' }, { modified: '2026-11-22 10:00:00.000000' }, {}])).toBe('2026-11-22 10:00:00.000000')
  })

  it('returns undefined when no row carries modified', () => {
    expect(latestModified([{}, { modified: 3 }])).toBeUndefined()
  })
})

describe('mergeIncrementalRows', () => {
  it('overlays changes, keeps order, appends new rows and drops deleted ones', () => {
    const existing = [{ name: 'A', rate: 1, extra: 'keep' }, { name: 'B', rate: 2 }, { name: 'C', rate: 3 }]
    const changed = [{ name: 'C', rate: 30 }, { name: 'D', rate: 4 }]
    expect(mergeIncrementalRows(existing, changed, new Set(['A', 'C', 'D']))).toEqual([{ name: 'A', rate: 1, extra: 'keep' }, { name: 'C', rate: 30 }, { name: 'D', rate: 4 }])
  })
})
