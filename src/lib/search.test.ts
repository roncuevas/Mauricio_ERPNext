import { describe, expect, it } from 'vitest'
import { fuzzyMatch, rankProductSearch, searchScore } from './search'

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

describe('product search ranking', () => {
  const arena = { name: 'ITEM-001', item_name: 'Arena de gato 10 kg', brand: 'Michi', uoms: [{ uom: 'Kg', conversion_factor: 1 }, { uom: 'Bulto', conversion_factor: 20 }] }
  const collar = { name: 'ITEM-002', item_name: 'Collar verde', brand: 'PetGo', tags: ['Accesorios'] }
  const croquetas = { name: 'ITEM-003', item_name: 'Croquetas Nupec Adulto 20 kg', barcodes: [{ barcode: '7501234567890', barcode_type: 'EAN' }] }
  const shampoo = { name: 'ITEM-004', item_name: 'Shampoo antipulgas', attributes: [{ attribute: 'Tamaño', attribute_value: 'Grande' }] }
  const items = [arena, collar, croquetas, shampoo]

  it('does not match short words contained in the query', () => {
    expect(rankProductSearch(items, 'verde')).toEqual([collar])
    expect(rankProductSearch(items, 'grande')).toEqual([shampoo])
  })

  it('searches unit names but not conversion factors', () => {
    expect(rankProductSearch(items, 'bulto')).toEqual([arena])
    expect(rankProductSearch(items, '20')).toEqual([croquetas])
  })

  it('never tolerates typos in codes or barcodes', () => {
    expect(rankProductSearch(items, '7501234567891')).toEqual([])
    expect(rankProductSearch(items, '7501234567890')).toEqual([croquetas])
    expect(rankProductSearch(items, 'ean')).toEqual([])
  })

  it('finds tags, attributes, plurals and word typos, ranked by relevance', () => {
    expect(rankProductSearch(items, 'accesorio')).toEqual([collar])
    expect(rankProductSearch(items, 'tamano grande')).toEqual([shampoo])
    expect(rankProductSearch(items, 'arenas')).toEqual([arena])
    expect(rankProductSearch(items, 'shampo')).toEqual([shampoo])
    expect(rankProductSearch(items, 'kg')).toEqual([arena, croquetas])
  })

  it('returns every item for an empty query', () => {
    expect(rankProductSearch(items, '  ')).toEqual(items)
  })
})
