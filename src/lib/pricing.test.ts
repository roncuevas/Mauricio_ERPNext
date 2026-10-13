import { describe, expect, it } from 'vitest'
import { calculateGrossMargin, findComparablePurchase, findComparablePurchases } from './pricing'

describe('price margin calculation', () => {
  it('selects lowest comparable supplier cost and calculates gross margin', () => {
    const sale = { name: 'SALE-1', item_code: 'DOG-20', selling: 1, price_list_rate: 100, uom: 'Bulto', currency: 'MXN' }
    const purchase = findComparablePurchase(sale, [
      { name: 'BUY-1', item_code: 'DOG-20', buying: 1, price_list_rate: 70, uom: 'Bulto', currency: 'MXN', supplier: 'Proveedor A' },
      { name: 'BUY-2', item_code: 'DOG-20', buying: 1, price_list_rate: 65, uom: 'Bulto', currency: 'MXN', supplier: 'Proveedor B' },
      { name: 'BUY-3', item_code: 'DOG-20', buying: 1, price_list_rate: 10, uom: 'Kg', currency: 'MXN', supplier: 'Proveedor C' },
    ])

    expect(purchase?.supplier).toBe('Proveedor B')
    expect(calculateGrossMargin(sale, purchase!)).toEqual({ amount: 35, percentage: 35 })
  })

  it('does not compare different currencies or UOMs', () => {
    const sale = { name: 'SALE-1', item_code: 'DOG-20', selling: 1, price_list_rate: 100, uom: 'Bulto', currency: 'MXN' }
    expect(findComparablePurchase(sale, [{ name: 'BUY-1', item_code: 'DOG-20', buying: 1, price_list_rate: 70, uom: 'Kg', currency: 'MXN' }])).toBeNull()
  })

  it('returns the best comparable cost for every supplier', () => {
    const sale = { name: 'SALE-1', item_code: 'DOG-20', selling: 1, price_list_rate: 100, uom: 'Bulto', currency: 'MXN' }
    const purchases = findComparablePurchases(sale, [
      { name: 'BUY-A-1', item_code: 'DOG-20', buying: 1, price_list_rate: 70, uom: 'Bulto', currency: 'MXN', supplier: 'Proveedor A' },
      { name: 'BUY-A-2', item_code: 'DOG-20', buying: 1, price_list_rate: 65, uom: 'Bulto', currency: 'MXN', supplier: 'Proveedor A' },
      { name: 'BUY-B-1', item_code: 'DOG-20', buying: 1, price_list_rate: 80, uom: 'Bulto', currency: 'MXN', supplier: 'Proveedor B' },
    ])

    expect(purchases.map((price) => [price.supplier, price.price_list_rate])).toEqual([['Proveedor A', 65], ['Proveedor B', 80]])
  })
})
