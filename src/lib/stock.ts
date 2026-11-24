import type { Company, StockBin, StockCache, VariantItem, Warehouse } from './types'
import type { ErpNextClient } from './erpnext'
import { listAllDocuments } from './pagination'
import { rankProductSearch } from './search'

const PAGE_SIZE = 25

export function stockSearch(bins: StockBin[], items: VariantItem[], search: string) {
  const itemMap = new Map(items.map((item) => [item.name, item]))
  return rankProductSearch(bins, search, (bin) => itemMap.get(bin.item_code) ?? { name: bin.item_code })
}

export function visibleStockBins(bins: StockBin[], _items: VariantItem[] = [], _warehouses: Warehouse[] = []) {
  const warehouseNames = new Set(_warehouses.filter((warehouse) => !warehouse.disabled && !warehouse.is_group).map((warehouse) => warehouse.name))
  return bins.filter((bin) => warehouseNames.has(bin.warehouse) && [bin.actual_qty, bin.reserved_qty, bin.ordered_qty, bin.projected_qty, bin.stock_value].some((value) => Number(value ?? 0) !== 0))
}

export function paginateStock<T>(rows: T[], page: number, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  return { rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize), page: safePage, totalPages }
}

export function searchReconciliationItems(items: VariantItem[], search: string) {
  return rankProductSearch(items, search)
}

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

export type StockReconciliationPurpose = 'Stock Reconciliation' | 'Opening Stock'

export type StockReconciliationInput = {
  company: string
  warehouse: string
  purpose?: StockReconciliationPurpose
  /** Only sent with `set_posting_time`; otherwise ERPNext posts at the server's current date and time. */
  posting?: { date: string; time: string }
  remarks?: string
  /** Defaults to the company's Stock Adjustment Account and cost center in ERPNext. */
  expenseAccount?: string
  costCenter?: string
  allowZeroValuationRate?: boolean
  /** An omitted valuation rate keeps ERPNext's current rate; an explicit 0 revalues to zero. */
  lines: Array<{ itemCode: string; qty: number; valuationRate?: number }>
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
  if (!input.lines.length) throw new Error('Agrega al menos un producto con cantidad contada.')
  if (input.lines.some((line) => !line.itemCode || !Number.isFinite(line.qty) || line.qty < 0)) throw new Error('Cada cantidad contada debe ser cero o mayor.')
  if (input.lines.some((line) => line.valuationRate !== undefined && (!Number.isFinite(line.valuationRate) || line.valuationRate < 0))) throw new Error('La valoración debe ser cero o mayor.')
  if (!input.allowZeroValuationRate && input.lines.some((line) => line.valuationRate === 0 && line.qty > 0)) throw new Error('Una valoración en cero requiere activar “Permitir valoración cero”.')
  if (input.posting && (!input.posting.date || !input.posting.time)) throw new Error('Fecha y hora son obligatorias.')
  return {
    doctype: 'Stock Reconciliation',
    purpose: input.purpose ?? 'Stock Reconciliation',
    company: input.company,
    ...(input.posting ? { set_posting_time: 1, posting_date: input.posting.date, posting_time: input.posting.time } : {}),
    remarks: input.remarks || undefined,
    expense_account: input.expenseAccount || undefined,
    cost_center: input.costCenter || undefined,
    items: input.lines.map((line) => ({ item_code: line.itemCode, warehouse: input.warehouse, qty: line.qty, ...(line.valuationRate === undefined ? {} : { valuation_rate: line.valuationRate }), ...(input.allowZeroValuationRate && line.valuationRate === 0 ? { allow_zero_valuation_rate: 1 } : {}) })),
  }
}

/** Local calendar date and time (ERPNext posting fields are naive, not UTC). */
export function localPostingNow(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}:00` }
}

export function activeWarehouses(warehouses: Warehouse[], company = '') {
  return warehouses.filter((warehouse) => !warehouse.disabled && !warehouse.is_group && (!company || warehouse.company === company))
}

/** Exact code, item code or barcode match, so a barcode scanner followed by Enter adds the right product. */
export function findExactItem(items: VariantItem[], search: string) {
  const needle = search.trim().toLocaleLowerCase()
  if (!needle) return undefined
  return items.find((item) => item.name.toLocaleLowerCase() === needle || item.item_code?.toLocaleLowerCase() === needle || item.barcodes?.some((barcode) => barcode.toLocaleLowerCase() === needle))
}

/**
 * Inserts (or updates the existing draft) and submits a stock document. Returns the document name.
 * When submit fails after insert, `onDraft` keeps the draft name so a retry updates it instead of creating another one.
 */
export async function saveAndSubmit(client: ErpNextClient, doctype: string, payload: Record<string, unknown>, draftName: string, onDraft: (name: string) => void) {
  let name = draftName
  if (name) await client.updateDocument(doctype, name, payload)
  else { name = (await client.createDocument<{ name: string }>(doctype, payload)).name; onDraft(name) }
  await client.submitDocument(doctype, name)
  return name
}

/** Keeps the Inventario list filters when moving to and from the reconciliation screen. */
export function stockReturnQuery(params: URLSearchParams) {
  const query = new URLSearchParams()
  for (const key of ['company', 'warehouse', 'search', 'page']) { const value = params.get(key); if (value) query.set(key, value) }
  return query.toString()
}

/** Where a stock document returns: a same-app `returnTo` (e.g. Pendientes) or the stock page with its filters. */
export function stockBackPath(params: URLSearchParams) {
  const returnTo = params.get('returnTo')
  if (returnTo?.startsWith('/') && !returnTo.startsWith('//')) return returnTo
  const query = stockReturnQuery(params)
  return `/stock${query ? `?${query}` : ''}`
}

export function reconciliationDifference(systemQty: number, counted: string) {
  if (counted.trim() === '') return null
  const qty = Number(counted)
  return Number.isFinite(qty) ? qty - systemQty : null
}

/** Re-downloads only the Bins touched by a submitted document and merges them into the cache. */
export async function refreshStockBins(client: ErpNextClient, cache: StockCache, warehouse: string, itemCodes: string[]): Promise<StockCache> {
  const fresh = (await client.listDocuments<StockBin>('Bin', { fields: ['name', 'item_code', 'warehouse', 'actual_qty', 'reserved_qty', 'ordered_qty', 'projected_qty', 'valuation_rate', 'stock_value'], filters: [['warehouse', '=', warehouse], ['item_code', 'in', itemCodes]], pageLength: Math.max(itemCodes.length, 1) })).data
  const touched = new Set(itemCodes)
  return { ...cache, bins: [...cache.bins.filter((bin) => bin.warehouse !== warehouse || !touched.has(bin.item_code)), ...fresh] }
}

const OPENING_ENTRY_ERROR = 'Difference Account must be a Asset/Liability type account'

/** ERPNext applies opening-entry rules when the company has no stock transactions yet, even for purpose Stock Reconciliation. */
export function isOpeningEntryError(error: unknown) {
  return error instanceof Error && error.message.includes(OPENING_ENTRY_ERROR)
}

const ERPNEXT_STOCK_MESSAGES: Array<[string, string]> = [
  ['None of the items have any change in quantity or value', 'Ningún producto cambia de cantidad ni de valoración respecto a ERPNext.'],
  ['Valuation Rate required', 'ERPNext no encontró una valoración para un producto sin existencia previa. Captúrala en Opciones avanzadas.'],
  [OPENING_ENTRY_ERROR, 'ERPNext trata este documento como inventario inicial: el propósito es Inventario inicial o la empresa aún no tiene movimientos de inventario. Usa el propósito Inventario inicial con una cuenta de activo o pasivo, como Apertura temporal (Temporary Opening).'],
  ['Purchase Order number required for Item', 'ERPNext exige una orden de compra para recibir mercancía (Buying Settings → Purchase Order Required). Registra esta recepción desde la orden de compra en ERPNext.'],
  ['Posting Date cannot be future date', 'La fecha de contabilización no puede ser futura.'],
  ['is blocked so this transaction cannot proceed', 'El proveedor está bloqueado en ERPNext y no acepta nuevas transacciones.'],
  ['Received Qty must be equal to Accepted + Rejected Qty', 'La cantidad recibida debe ser igual a aceptada + rechazada.'],
  ['use the purpose Stock Reconciliation instead of Opening Stock', 'Algunos productos ya tienen movimientos en este almacén; usa el propósito Reconciliación en lugar de Inventario inicial.'],
]

export async function loadStockData(client: ErpNextClient, onProgress?: (message: string) => void): Promise<Omit<StockCache, 'profileId' | 'updatedAt'>> {
  onProgress?.('Descargando empresas...')
  const companies = (await client.listDocuments<Company>('Company', { fields: ['name', 'company_name', 'abbr', 'default_currency'], orderBy: 'name asc', pageLength: 500 })).data
  onProgress?.('Descargando almacenes...')
  const warehouses = (await client.listDocuments<Warehouse>('Warehouse', { fields: ['name', 'warehouse_name', 'parent_warehouse', 'company', 'warehouse_type', 'is_group', 'disabled'], orderBy: 'name asc', pageLength: 500 })).data
  onProgress?.('Descargando productos stockables...')
  const items = await listAllDocuments<VariantItem>(client, 'Item', { fields: ['name', 'item_name', 'stock_uom', 'disabled', 'is_stock_item', 'has_variants', 'has_serial_no', 'has_batch_no'], orderBy: 'item_name asc' }, (count) => onProgress?.(`Descargando productos: ${count}`))
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

/** ERPNext rejects templates (items with variants) in stock transactions; only their variants hold stock. */
export function itemCanMove(item: VariantItem | undefined) {
  return Boolean(item && !item.disabled && !item.has_variants && !item.has_serial_no && !item.has_batch_no)
}

export function itemCanReconcile(item: VariantItem) {
  return itemCanMove(item) && item.is_stock_item !== false && item.is_stock_item !== 0
}

export function stockErrorMessage(error: unknown) {
  if (error instanceof Error) return ERPNEXT_STOCK_MESSAGES.find(([needle]) => error.message.includes(needle))?.[1] ?? error.message
  return 'No se pudo completar la operación de inventario.'
}
