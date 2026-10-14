import { describe, expect, it } from 'vitest'
import { fuzzyMatch, searchScore } from './search'

describe('catalog fuzzy search', () => {
  it('matches reordered words, accents, typos, and nested barcode values', () => {
    expect(fuzzyMatch('nupec cahorro', ['Nupec - Lata para Perro Cachorro'])).toBe(true)
    expect(fuzzyMatch('royal lata adulto', ['Royal Canin Adulto Lata'])).toBe(true)
    expect(fuzzyMatch('7501234567890', [{ barcodes: [{ barcode: '7501234567890' }] }])).toBe(true)
  })

  it('scores exact product identity above generic text matches', () => {
    const exact = searchScore('B2N-AD-PERFECT-2', [{ value: 'B2N-AD-PERFECT-2', weight: 5 }, { value: 'Back To Nature', weight: 2 }])
    const generic = searchScore('B2N-AD-PERFECT-2', [{ value: 'Back To Nature Adulto', weight: 2 }])
    expect(exact?.score).toBeGreaterThan(generic?.score ?? 0)
  })

  it('rejects a result missing a required meaningful token', () => {
    expect(searchScore('perfect control', [{ value: 'Back To Nature Croquetas Adulto', weight: 5 }])).toBeNull()
  })
})
