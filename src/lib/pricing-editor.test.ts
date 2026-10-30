import { describe, expect, it } from 'vitest'
import { findDuplicateItemPrice, suggestComparableItemPrice } from './pricing'

describe('price editor suggestions and duplicate detection', () => {
  const candidate = { item_code: 'ITEM-1', price_list: 'Nueva Venta', price_list_rate: 0, selling: 1, buying: 0, uom: 'Kg', currency: 'MXN' }

  it('finds the same item, list, UOM, validity and party regardless of entered rate', () => {
    const existing = { ...candidate, name: 'PRICE-1', price_list_rate: 42 }
    expect(findDuplicateItemPrice([existing], candidate)).toEqual(existing)
    expect(findDuplicateItemPrice([existing], candidate, 'PRICE-1')).toBeNull()
  })

  it('averages active prices from other lists only when dimensions are comparable', () => {
    const prices = [
      { ...candidate, name: 'PRICE-1', price_list: 'Lista A', price_list_rate: 80 },
      { ...candidate, name: 'PRICE-2', price_list: 'Lista B', price_list_rate: 100 },
      { ...candidate, name: 'PRICE-3', price_list: 'Otra UOM', uom: 'Unidad', price_list_rate: 999 },
      { ...candidate, name: 'PRICE-4', price_list: 'Otra moneda', currency: 'USD', price_list_rate: 999 },
      { ...candidate, name: 'PRICE-5', price_list: 'Vencida', price_list_rate: 999, valid_upto: '2025-01-01' },
    ]
    expect(suggestComparableItemPrice(prices, candidate, 'Kg', '2026-10-29')).toMatchObject({ average: 90, count: 2 })
  })
})
