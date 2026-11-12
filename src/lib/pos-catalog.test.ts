import { describe, expect, it } from 'vitest'
import { buildPriceIndex, defaultUom, findItemsByBarcode, priceForUom, priceForUomFromIndex, uomOptionLabel, variantPriceRange } from './pos-catalog'

describe('POS catalog helpers', () => {
  const item = { name: 'ITEM-1', item_name: 'Producto', stock_uom: 'Kg', sales_uom: 'Bulto', uoms: [{ uom: 'Kg', conversion_factor: 1 }, { uom: 'Bulto', conversion_factor: 20 }] }

  it('chooses the sales UOM and matching selling price', () => {
    expect(defaultUom(item).uom).toBe('Bulto')
    expect(priceForUom(item, 'Bulto', [{ name: 'P-1', item_code: 'ITEM-1', selling: 1, price_list_rate: 500, uom: 'Bulto' }])).toBe(500)
  })

  it('formats a variant price range', () => {
    expect(variantPriceRange([{ name: 'A' }, { name: 'B' }], [{ name: 'P1', item_code: 'A', selling: 1, price_list_rate: 50 }, { name: 'P2', item_code: 'B', selling: 1, price_list_rate: 100 }], undefined, 'MXN')).toContain('50.00')
  })

  it('indexes selling prices by list and resolves a UOM without scanning the catalog', () => {
    const index = buildPriceIndex([
      { name: 'P1', item_code: 'ITEM-1', selling: 1, price_list: 'Standard Selling', price_list_rate: 500, uom: 'Bulto' },
      { name: 'P2', item_code: 'ITEM-1', selling: 1, price_list: 'Wholesale', price_list_rate: 400, uom: 'Bulto' },
    ], 'Standard Selling')

    expect(priceForUomFromIndex(item, 'Bulto', index)).toBe(500)
    expect(index.has('ITEM-1')).toBe(true)
    expect(index.get('ITEM-1')).toHaveLength(1)
  })

  it('labels the default UOM and conversion UOMs with the base unit', () => {
    const itemWithKgDefault = { ...item, sales_uom: 'Kg' }
    expect(uomOptionLabel(itemWithKgDefault, { uom: 'Bulto', conversion_factor: 20 })).toBe('Bulto · 20 Kg')
    expect(uomOptionLabel(itemWithKgDefault, { uom: 'Kg', conversion_factor: 1 })).toBe('Kg · Default')
  })

  it('matches a scanned barcode exactly across Item and child barcode fields', () => {
    expect(findItemsByBarcode([{ name: 'A', barcode: ' 7501 ' }, { name: 'B', barcodes: [{ barcode: '7502' }] }], '7502')).toEqual([{ name: 'B', barcodes: [{ barcode: '7502' }] }])
    expect(findItemsByBarcode([{ name: 'A', barcode: '7501' }], '750')).toEqual([])
  })
})
