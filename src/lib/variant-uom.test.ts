import { describe, expect, it } from 'vitest'
import { hasMultipleUoms, mergeItemUoms } from './variant-cache'

describe('item UOM catalog', () => {
  it('adds stock UOM, removes duplicates, and preserves conversion factors', () => {
    const items = [{ name: 'DOG-20', stock_uom: 'Kg' }]
    const merged = mergeItemUoms(items, [
      { parent: 'DOG-20', uom: 'Kg', conversion_factor: 1 },
      { parent: 'DOG-20', uom: 'Bulto', conversion_factor: 20 },
    ])

    expect(merged[0].uoms).toEqual([{ uom: 'Kg', conversion_factor: 1 }, { uom: 'Bulto', conversion_factor: 20 }])
    expect(hasMultipleUoms(merged[0])).toBe(true)
  })
})
