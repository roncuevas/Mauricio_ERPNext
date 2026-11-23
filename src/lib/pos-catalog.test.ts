import { describe, expect, it } from 'vitest'
import { buildPriceIndex, defaultUom, findItemsByBarcode, priceForUom, priceForUomFromIndex, sellablePrice, stockLevel, uomOptionLabel, variantDisplay, variantPriceRange } from './pos-catalog'

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

  it('describes a variant by what differs from its template', () => {
    const template = { name: 'NUPEC', item_name: 'Nupec - Croquetas Adulto', brand: 'NUPEC' }
    const variant = { name: 'NUPEC-5', item_name: 'Nupec - Croquetas Adulto 5kg', brand: 'NUPEC', attributes: [{ attribute: 'Peso (kg)', attribute_value: '5' }] }
    expect(variantDisplay(template, variant)).toEqual({ label: '5kg', details: [] })
    expect(variantDisplay(template, { ...variant, item_name: 'Otro nombre', attributes: [{ attribute: 'Peso (kg)', attribute_value: '5' }, { attribute: 'Sabor', attribute_value: 'Pollo' }] })).toEqual({ label: '5 · Pollo', details: [] })
    expect(variantDisplay(template, { ...variant, brand: 'Otra', attributes: [...variant.attributes, { attribute: 'Sabor', attribute_value: 'Pollo' }] })).toEqual({ label: '5kg', details: ['Sabor: Pollo', 'Otra'] })
    expect(variantDisplay(template, { name: 'X-1', item_name: 'Sin relación' })).toEqual({ label: 'Sin relación', details: [] })
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

  it('treats zero or invalid prices as not set, like the ERPNext POS', () => {
    expect(sellablePrice(0)).toBeNull()
    expect(sellablePrice(-5)).toBeNull()
    expect(sellablePrice(Number.NaN)).toBeNull()
    expect(sellablePrice(12.5)).toBe(12.5)
  })
})

describe('stockLevel', () => {
  it('uses ERPNext POS thresholds', () => {
    expect(stockLevel({ name: 'A', stock_known: true, available_qty: 0 })).toBe('out')
    expect(stockLevel({ name: 'A', stock_known: true, available_qty: 10 })).toBe('low')
    expect(stockLevel({ name: 'A', stock_known: true, available_qty: 11 })).toBe('ok')
    expect(stockLevel({ name: 'A', stock_known: false, available_qty: 50 })).toBe('unknown')
  })
})
