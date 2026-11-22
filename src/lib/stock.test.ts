import { describe, expect, it, vi } from 'vitest'
import { isOpeningEntryError, itemCanReconcile, localPostingNow, movementPayload, paginateStock, reconciliationDifference, reconciliationPayload, refreshStockBins, searchReconciliationItems, stockErrorMessage, stockSearch, visibleStockBins } from './stock'
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

  it('keeps ERPNext current valuation when the rate is omitted and posts now by default', () => {
    const payload = reconciliationPayload({ company: 'Empresa Demo', warehouse: 'Sucursal 1 - ED', lines: [{ itemCode: 'ITEM-001', qty: 7 }] })
    expect(payload.purpose).toBe('Stock Reconciliation')
    expect(payload).not.toHaveProperty('set_posting_time')
    expect(payload).not.toHaveProperty('posting_date')
    expect(payload.items).toEqual([{ item_code: 'ITEM-001', warehouse: 'Sucursal 1 - ED', qty: 7 }])
  })

  it('sends set_posting_time only for a custom posting date and time', () => {
    const payload = reconciliationPayload({ company: 'Empresa Demo', warehouse: 'Sucursal 1 - ED', posting: { date: '2026-10-14', time: '10:00:00' }, lines: [{ itemCode: 'ITEM-001', qty: 7, valuationRate: 125 }] })
    expect(payload).toMatchObject({ set_posting_time: 1, posting_date: '2026-10-14', posting_time: '10:00:00' })
    expect(payload.items[0]).toEqual({ item_code: 'ITEM-001', warehouse: 'Sucursal 1 - ED', qty: 7, valuation_rate: 125 })
  })

  it('supports opening stock with an explicit difference account and cost center', () => {
    const payload = reconciliationPayload({ company: 'Empresa Demo', warehouse: 'A', purpose: 'Opening Stock', expenseAccount: 'Temporary Opening - ED', costCenter: 'Main - ED', lines: [{ itemCode: 'ITEM-001', qty: 3, valuationRate: 80 }] })
    expect(payload).toMatchObject({ purpose: 'Opening Stock', expense_account: 'Temporary Opening - ED', cost_center: 'Main - ED' })
  })

  it('requires the explicit zero-valuation flag for a zero rate', () => {
    const base = { company: 'Empresa Demo', warehouse: 'A', lines: [{ itemCode: 'ITEM-001', qty: 3, valuationRate: 0 }] }
    expect(() => reconciliationPayload(base)).toThrow('Permitir valoración cero')
    expect(reconciliationPayload({ ...base, allowZeroValuationRate: true }).items[0]).toEqual({ item_code: 'ITEM-001', warehouse: 'A', qty: 3, valuation_rate: 0, allow_zero_valuation_rate: 1 })
  })

  it('uses the local calendar date for posting', () => {
    expect(localPostingNow(new Date(2026, 10, 22, 23, 45, 12))).toEqual({ date: '2026-11-22', time: '23:45:00' })
  })

  it('computes the counted difference only after a count is entered', () => {
    expect(reconciliationDifference(10, '')).toBeNull()
    expect(reconciliationDifference(10, '7')).toBe(-3)
    expect(reconciliationDifference(0, '4')).toBe(4)
  })

  it('translates common ERPNext reconciliation errors', () => {
    expect(stockErrorMessage(new Error('None of the items have any change in quantity or value.'))).toContain('Ningún producto cambia')
    const opening = new Error('Difference Account must be a Asset/Liability type account, since this Stock Reconciliation is an Opening Entry')
    expect(isOpeningEntryError(opening)).toBe(true)
    expect(stockErrorMessage(opening)).toContain('aún no tiene movimientos de inventario')
  })

  it('refreshes only the touched bins', async () => {
    const cache = { profileId: 'p', updatedAt: 'x', companies: [], warehouses: [], bins: [{ item_code: 'A', warehouse: 'W', actual_qty: 1 }, { item_code: 'B', warehouse: 'W', actual_qty: 2 }, { item_code: 'A', warehouse: 'Z', actual_qty: 5 }] }
    const listDocuments = vi.fn().mockResolvedValue({ data: [{ item_code: 'A', warehouse: 'W', actual_qty: 9 }] })
    const next = await refreshStockBins({ listDocuments } as never, cache, 'W', ['A'])
    expect(listDocuments.mock.calls[0][1].filters).toEqual([['warehouse', '=', 'W'], ['item_code', 'in', ['A']]])
    expect(next.bins).toEqual([{ item_code: 'B', warehouse: 'W', actual_qty: 2 }, { item_code: 'A', warehouse: 'Z', actual_qty: 5 }, { item_code: 'A', warehouse: 'W', actual_qty: 9 }])
    expect(next.updatedAt).toBe('x')
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
