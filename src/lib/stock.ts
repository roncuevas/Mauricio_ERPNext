import type { Company, StockBin, StockCache, VariantItem, Warehouse } from './types'
import type { ErpNextClient } from './erpnext'
import { listAllDocuments } from './pagination'

export type StockMovementKind = 'Material Receipt' | 'Material Issue' | 'Material Transfer'

export type StockMovementLine = {
  itemCode: string
  qty: number
  uom: string
  basicRate?: number
}

export type StockMovementInput = {
  company: string
  kind: StockMovementKind
  sourceWarehouse?: string
  targetWarehouse?: string
  postingDate: string
  postingTime: string
  remarks: string
  lines: StockMovementLine[]
}

export type StockReconciliationInput = {
  company: string
  warehouse: string
  postingDate: string
  postingTime: string
  remarks?: string
  lines: Array<{ itemCode: string; qty: number; valuationRate: number }>
}

export function movementPayload(input: StockMovementInput) {
  if (!input.company.trim()) throw new Error('Selecciona una empresa.')
  if (!input.postingDate || !input.postingTime) throw new Error('Fecha y hora son obligatorias.')
  if (!input.lines.length) throw new Error('Agrega al menos un producto.')
  if (input.lines.some((line) => !line.itemCode || !Number.isFinite(line.qty) || line.qty <= 0)) throw new Error('Cada línea debe tener producto y cantidad mayor que cero.')
  if (input.kind === 'Material Receipt' && input.lines.some((line) => !Number.isFinite(line.basicRate) || (line.basicRate ?? 0) < 0)) throw new Error('Cada entrada requiere un costo válido.')
  if (input.kind === 'Material Issue' && !input.sourceWarehouse) throw new Error('Selecciona el almacén de salida.')
  if (input.kind === 'Material Receipt' && !input.targetWarehouse) throw new Error('Selecciona el almacén de entrada.')
  if (input.kind === 'Material Transfer' && (!input.sourceWarehouse || !input.targetWarehouse || input.sourceWarehouse === input.targetWarehouse)) throw new Error('Selecciona almacenes de origen y destino distintos.')
  const items = input.lines.map((line) => ({ item_code: line.itemCode, qty: line.qty, uom: line.uom || undefined, basic_rate: input.kind === 'Material Receipt' ? line.basicRate : undefined, s_warehouse: input.kind !== 'Material Receipt' ? input.sourceWarehouse : undefined, t_warehouse: input.kind !== 'Material Issue' ? input.targetWarehouse : undefined }))
  return { doctype: 'Stock Entry', stock_entry_type: input.kind, company: input.company, posting_date: input.postingDate, posting_time: input.postingTime, remarks: input.remarks || undefined, from_warehouse: input.kind !== 'Material Receipt' ? input.sourceWarehouse : undefined, to_warehouse: input.kind !== 'Material Issue' ? input.targetWarehouse : undefined, items }
}

export function reconciliationPayload(input: StockReconciliationInput) {
  if (!input.company.trim() || !input.warehouse.trim()) throw new Error('Selecciona empresa y almacén.')
  if (!input.lines.length) throw new Error('Agrega al menos un producto.')
  if (input.lines.some((line) => !line.itemCode || !Number.isFinite(line.qty) || line.qty < 0 || !Number.isFinite(line.valuationRate) || line.valuationRate < 0)) throw new Error('Cantidad y valoración deben ser válidas.')
  return { doctype: 'Stock Reconciliation', purpose: 'Stock Reconciliation', company: input.company, posting_date: input.postingDate, posting_time: input.postingTime, remarks: input.remarks || undefined, items: input.lines.map((line) => ({ item_code: line.itemCode, warehouse: input.warehouse, qty: line.qty, valuation_rate: line.valuationRate })) }
}

export async function loadStockData(client: ErpNextClient, onProgress?: (message: string) => void): Promise<Omit<StockCache, 'profileId' | 'updatedAt'>> {
  onProgress?.('Descargando empresas...')
  const companies = (await client.listDocuments<Company>('Company', { fields: ['name', 'company_name', 'abbr', 'default_currency'], orderBy: 'name asc', pageLength: 500 })).data
  onProgress?.('Descargando almacenes...')
  const warehouses = (await client.listDocuments<Warehouse>('Warehouse', { fields: ['name', 'warehouse_name', 'parent_warehouse', 'company', 'warehouse_type', 'is_group', 'disabled'], orderBy: 'name asc', pageLength: 500 })).data
  onProgress?.('Descargando productos stockables...')
  const items = await listAllDocuments<VariantItem>(client, 'Item', { fields: ['name', 'item_name', 'stock_uom', 'disabled', 'is_stock_item', 'has_serial_no', 'has_batch_no'], orderBy: 'item_name asc' }, (count) => onProgress?.(`Descargando productos: ${count}`))
  onProgress?.('Descargando existencias...')
  const bins: StockBin[] = []
  let start = 0
  while (true) {
    const batch = await client.listDocuments<StockBin>('Bin', { fields: ['name', 'item_code', 'warehouse', 'actual_qty', 'reserved_qty', 'ordered_qty', 'projected_qty', 'valuation_rate', 'stock_value'], start, pageLength: 500, orderBy: 'warehouse asc, item_code asc' })
    bins.push(...batch.data)
    onProgress?.(`Descargando existencias: ${bins.length}`)
    if (batch.data.length < 500) break
    start += batch.data.length
  }
  return { companies, warehouses, bins, items }
}

export function itemCanMove(item: VariantItem | undefined) {
  return Boolean(item && !item.disabled && !item.has_serial_no && !item.has_batch_no)
}

export function itemCanReconcile(item: VariantItem) {
  return itemCanMove(item) && item.is_stock_item !== false && item.is_stock_item !== 0
}

export function stockErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'No se pudo completar la operación de inventario.'
}
