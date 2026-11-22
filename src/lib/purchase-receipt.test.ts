import { describe, expect, it } from 'vitest'
import { purchaseReceiptPayload, purchaseUomOptions, suggestPurchaseRate } from './purchase-receipt'
import type { ItemPrice } from './types'

const line = { itemCode: 'ITEM-CROQ-20', itemName: 'Croquetas Adulto 20 kg', qty: 5, uom: 'Unit', stockUom: 'Unit', conversionFactor: 1, rate: 1200.5 }
const base = { company: 'Tienda Demo', currency: 'MXN', supplier: 'PROVEEDOR A', warehouse: 'Almacén Centro - TD', lines: [line] }

describe('purchase receipt payload', () => {
  it('builds a direct receipt that ERPNext posts now with explicit item details', () => {
    const payload = purchaseReceiptPayload({ ...base, supplierDeliveryNote: ' R-123 ' })
    expect(payload).toMatchObject({ doctype: 'Purchase Receipt', supplier: 'PROVEEDOR A', company: 'Tienda Demo', currency: 'MXN', conversion_rate: 1, set_warehouse: 'Almacén Centro - TD', supplier_delivery_note: 'R-123' })
    expect(payload).not.toHaveProperty('set_posting_time')
    expect(payload).not.toHaveProperty('rejected_warehouse')
    expect(payload.items).toEqual([{ item_code: 'ITEM-CROQ-20', item_name: 'Croquetas Adulto 20 kg', qty: 5, received_qty: 5, uom: 'Unit', stock_uom: 'Unit', conversion_factor: 1, rate: 1200.5, warehouse: 'Almacén Centro - TD' }])
  })

  it('records rejected quantity in a separate warehouse so received = accepted + rejected', () => {
    const payload = purchaseReceiptPayload({ ...base, rejectedWarehouse: 'Rechazos - TD', lines: [{ ...line, qty: 4, rejectedQty: 1 }] })
    expect(payload.rejected_warehouse).toBe('Rechazos - TD')
    expect(payload.items[0]).toMatchObject({ qty: 4, rejected_qty: 1, received_qty: 5, rejected_warehouse: 'Rechazos - TD' })
    expect(() => purchaseReceiptPayload({ ...base, lines: [{ ...line, rejectedQty: 1 }] })).toThrow('almacén de rechazados')
    expect(() => purchaseReceiptPayload({ ...base, rejectedWarehouse: base.warehouse, lines: [{ ...line, rejectedQty: 1 }] })).toThrow('distinto')
  })

  it('sends set_posting_time only for a custom posting date', () => {
    expect(purchaseReceiptPayload({ ...base, posting: { date: '2026-11-20', time: '09:30:00' } })).toMatchObject({ set_posting_time: 1, posting_date: '2026-11-20', posting_time: '09:30:00' })
  })

  it('rejects missing supplier, empty quantity and invalid cost', () => {
    expect(() => purchaseReceiptPayload({ ...base, supplier: '' })).toThrow('proveedor')
    expect(() => purchaseReceiptPayload({ ...base, lines: [{ ...line, qty: 0 }] })).toThrow('Cantidad inválida')
    expect(() => purchaseReceiptPayload({ ...base, lines: [{ ...line, rate: Number.NaN }] })).toThrow('costo válido')
  })
})

describe('purchase UOM and cost suggestion', () => {
  const item = { name: 'ITEM-CROQ-20', stock_uom: 'Unit', purchase_uom: 'Caja', uoms: [{ uom: 'Unit', conversion_factor: 1 }, { uom: 'Caja', conversion_factor: 4 }] }
  const prices: ItemPrice[] = [
    { name: 'P1', item_code: 'ITEM-CROQ-20', price_list: 'Standard Buying', price_list_rate: 1250, buying: 1, uom: 'Unit', supplier: 'PROVEEDOR B', valid_from: '2026-09-09' },
    { name: 'P2', item_code: 'ITEM-CROQ-20', price_list: 'Standard Buying', price_list_rate: 1200.5, buying: 1, uom: 'Unit', supplier: 'PROVEEDOR A', valid_from: '2026-10-13' },
    { name: 'P3', item_code: 'ITEM-CROQ-20', price_list: 'Standard Selling', price_list_rate: 1870, selling: 1, uom: 'Unit' },
    { name: 'P4', item_code: 'ITEM-CROQ-20', price_list: 'Standard Buying', price_list_rate: 1000, buying: 1, uom: 'Unit', supplier: 'PROVEEDOR A', valid_from: '2026-01-01', valid_upto: '2026-02-01' },
  ]

  it('defaults to the purchase UOM and lists conversions', () => {
    expect(purchaseUomOptions(item)).toEqual({ options: [{ uom: 'Unit', conversionFactor: 1 }, { uom: 'Caja', conversionFactor: 4 }], defaultUom: 'Caja' })
  })

  it('prefers the selected supplier, skips expired and selling prices, and converts from the stock UOM', () => {
    const unit = { uom: 'Unit', conversionFactor: 1 }
    expect(suggestPurchaseRate(prices, item.name, unit, 'Unit', 'PROVEEDOR B', '2026-11-22')).toEqual({ rate: 1250, priceList: 'Standard Buying', supplier: 'PROVEEDOR B' })
    expect(suggestPurchaseRate(prices, item.name, unit, 'Unit', 'OTRO', '2026-11-22')?.supplier).toBe('PROVEEDOR A')
    expect(suggestPurchaseRate(prices, item.name, { uom: 'Caja', conversionFactor: 4 }, 'Unit', 'PROVEEDOR A', '2026-11-22')?.rate).toBeCloseTo(4802)
    expect(suggestPurchaseRate(prices, 'OTRO', unit, 'Unit', 'PROVEEDOR A', '2026-11-22')).toBeNull()
  })
})
