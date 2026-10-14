import { describe, expect, it } from 'vitest'
import { itemCanReconcile, movementPayload, reconciliationPayload } from './stock'
import { paginateStock, searchReconciliationItems, stockSearch, visibleStockBins } from '../pages/stock-page'
import type { StockBin, VariantItem } from './types'

describe('stock payloads', () => {
  it('builds a multi-line material receipt with valuation', () => {
    const payload = movementPayload({ company: 'Empresa Demo', kind: 'Material Receipt', targetWarehouse: 'Sucursal 1 - ED', postingDate: '2026-10-14', postingTime: '10:00:00', remarks: 'Carga inicial', lines: [{ itemCode: 'ITEM-001', qty: 4, uom: 'Kg', basicRate: 120 }, { itemCode: 'ITEM-002', qty: 2, uom: 'Kg', basicRate: 80 }] })
    expect(payload.stock_entry_type).toBe('Material Receipt')
    expect(payload.items).toEqual([{ item_code: 'ITEM-001', qty: 4, uom: 'Kg', basic_rate: 120, s_warehouse: undefined, t_warehouse: 'Sucursal 1 - ED' }, { item_code: 'ITEM-002', qty: 2, uom: 'Kg', basic_rate: 80, s_warehouse: undefined, t_warehouse: 'Sucursal 1 - ED' }])
  })

  it('requires different warehouses for transfers', () => {
    expect(() => movementPayload({ company: 'Empresa Demo', kind: 'Material Transfer', sourceWarehouse: 'Sucursal 1 - ED', targetWarehouse: 'Sucursal 1 - ED', postingDate: '2026-10-14', postingTime: '10:00:00', remarks: '', lines: [{ itemCode: 'ITEM-001', qty: 1, uom: 'Kg' }] })).toThrow('almacenes de origen y destino distintos')
  })

  it('builds exact stock reconciliation quantities', () => {
    const payload = reconciliationPayload({ company: 'Empresa Demo', warehouse: 'Sucursal 1 - ED', postingDate: '2026-10-14', postingTime: '10:00:00', lines: [{ itemCode: 'ITEM-001', qty: 7, valuationRate: 125 }] })
    expect(payload.purpose).toBe('Stock Reconciliation')
    expect(payload.items).toEqual([{ item_code: 'ITEM-001', warehouse: 'Sucursal 1 - ED', qty: 7, valuation_rate: 125 }])
  })

  it('builds a multi-line reconciliation payload', () => {
    const payload = reconciliationPayload({ company: 'Empresa Demo', warehouse: 'Sucursal 1 - ED', postingDate: '2026-10-14', postingTime: '10:00:00', lines: [{ itemCode: 'ITEM-001', qty: 7, valuationRate: 125 }, { itemCode: 'ITEM-002', qty: 3, valuationRate: 80 }] })
    expect(payload.items).toHaveLength(2)
    expect(payload.items[1]).toEqual({ item_code: 'ITEM-002', warehouse: 'Sucursal 1 - ED', qty: 3, valuation_rate: 80 })
  })

  it('allows active stock items without an existing Bin', () => {
    expect(itemCanReconcile({ name: 'ITEM-001', is_stock_item: 1, disabled: 0 })).toBe(true)
    expect(itemCanReconcile({ name: 'SERVICE', is_stock_item: 0 })).toBe(false)
  })

  it('ranks reconciliation products with fuzzy code and name search', () => {
    const items = [
      { name: 'NUPEC-ADULTO-GRANEL', item_name: 'Nupec Croquetas Perro Adulto Granel' },
      { name: 'HILLS-CD', item_name: "Hill's Prescription Diet c/d" },
    ] as VariantItem[]
    expect(searchReconciliationItems(items, 'nupec adulto')[0].name).toBe('NUPEC-ADULTO-GRANEL')
    expect(searchReconciliationItems(items, 'prescripton')[0].name).toBe('HILLS-CD')
  })

  it('builds a single-line material issue', () => {
    const payload = movementPayload({ company: 'Empresa Demo', kind: 'Material Issue', sourceWarehouse: 'Almacén A', postingDate: '2026-10-14', postingTime: '10:00:00', remarks: '', lines: [{ itemCode: 'ITEM-001', qty: 3, uom: 'Unit' }] })
    expect(payload.items).toEqual([{ item_code: 'ITEM-001', qty: 3, uom: 'Unit', basic_rate: undefined, s_warehouse: 'Almacén A', t_warehouse: undefined }])
  })

  it('builds a single-line material transfer', () => {
    const payload = movementPayload({ company: 'Empresa Demo', kind: 'Material Transfer', sourceWarehouse: 'Almacén A', targetWarehouse: 'Almacén B', postingDate: '2026-10-14', postingTime: '10:00:00', remarks: '', lines: [{ itemCode: 'ITEM-001', qty: 2, uom: 'Unit' }] })
    expect(payload.from_warehouse).toBe('Almacén A')
    expect(payload.to_warehouse).toBe('Almacén B')
    expect(payload.items).toEqual([{ item_code: 'ITEM-001', qty: 2, uom: 'Unit', basic_rate: undefined, s_warehouse: 'Almacén A', t_warehouse: 'Almacén B' }])
  })

  it('searches by code or name and paginates 25 rows', () => {
    const items = [{ name: 'ITEM-001', item_name: 'Croquetas Premium' }] as VariantItem[]
    const bins = Array.from({ length: 26 }, (_, index) => ({ item_code: index === 0 ? 'ITEM-001' : `ITEM-${index + 1}`, warehouse: 'Almacén A' })) as StockBin[]
    expect(stockSearch(bins, items, 'premium')).toHaveLength(1)
    expect(paginateStock(bins, 1).rows).toHaveLength(25)
    expect(paginateStock(bins, 2).rows).toHaveLength(1)
    expect(paginateStock(bins, 99).page).toBe(2)
  })

  it('keeps every real bin returned by ERPNext without fabricating rows', () => {
    const items = [{ name: 'ITEM-001', is_stock_item: 1 }, { name: 'SERVICE', is_stock_item: 0 }] as VariantItem[]
    const bins = [{ item_code: 'ITEM-001', warehouse: 'Almacén A', actual_qty: 3 }, { item_code: 'SERVICE', warehouse: 'Almacén A', actual_qty: 2 }, { item_code: 'ITEM-001', warehouse: 'Almacén B', actual_qty: 0 }] as StockBin[]
    expect(visibleStockBins(bins, items, [{ name: 'Almacén A' }, { name: 'Almacén B', disabled: 1 }])).toEqual([bins[0], bins[1]])
  })
})
