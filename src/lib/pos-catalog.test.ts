import { describe, expect, it } from 'vitest'
import { defaultUom, priceForUom, variantPriceRange } from './pos-catalog'

describe('POS catalog helpers', () => {
  const item = { name: 'ITEM-1', item_name: 'Producto', stock_uom: 'Kg', sales_uom: 'Bulto', uoms: [{ uom: 'Kg', conversion_factor: 1 }, { uom: 'Bulto', conversion_factor: 20 }] }

  it('chooses the sales UOM and matching selling price', () => {
    expect(defaultUom(item).uom).toBe('Bulto')
    expect(priceForUom(item, 'Bulto', [{ name: 'P-1', item_code: 'ITEM-1', selling: 1, price_list_rate: 500, uom: 'Bulto' }])).toBe(500)
  })

  it('formats a variant price range', () => {
    expect(variantPriceRange([{ name: 'A' }, { name: 'B' }], [{ name: 'P1', item_code: 'A', selling: 1, price_list_rate: 50 }, { name: 'P2', item_code: 'B', selling: 1, price_list_rate: 100 }], undefined, 'MXN')).toContain('50.00')
  })
})
