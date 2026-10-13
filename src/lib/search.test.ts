import { describe, expect, it } from 'vitest'
import { fuzzyMatch } from './search'

describe('catalog fuzzy search', () => {
  it('matches reordered words, accents, typos, and nested barcode values', () => {
    expect(fuzzyMatch('nupec cahorro', ['Nupec - Lata para Perro Cachorro'])).toBe(true)
    expect(fuzzyMatch('royal lata adulto', ['Royal Canin Adulto Lata'])).toBe(true)
    expect(fuzzyMatch('7501234567890', [{ barcodes: [{ barcode: '7501234567890' }] }])).toBe(true)
  })
})
