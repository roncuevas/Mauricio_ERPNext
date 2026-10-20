import { ErpNextError, type ErpNextClient } from './erpnext'
import { listAllDocuments } from './pagination'
import { createCacheStore } from './indexed-db'
import { readItemCatalog, writeItemCatalog } from './item-cache'
import { readItemPriceCatalog, writeItemPriceCatalog } from './price-cache'
import { readVariantCatalog, writeVariantCatalog, mergeItemUoms } from './variant-cache'
import { readUomCatalog, writeUomCatalog } from './uom-cache'
import { readStockCache, writeStockCache } from './stock-cache'
import { readSupplierCatalog, writeSupplierCatalog } from './supplier-cache'
import { readDocTypeCatalog, writeDocTypeCatalog } from './doctype-cache'
import { readCustomerCatalog, readSalesOrderCatalog, upsertSalesOrderBucket, writeCustomerCatalog, writeSalesOrderCatalog } from './sales-order-cache'
import { loadStockData } from './stock'
import { readItemSearchDetails, readItemUomsThroughItems, readItemVariantAttributes, syncUomCatalog } from './catalog-sync'
import { normalizeSalesOrder } from './sales-orders'
import { CACHE_TTL_MS, getCacheStatus, type CacheKind, type CacheStatus } from './cache-policy'
import type { CachedItem, CustomerSummary, DocTypeCatalogCache, ItemCatalogCache, ItemPrice, ItemPriceCatalogCache, PosOpeningEntry, PosPaymentMethod, PosProfile, PosTaxTemplate, PriceList, QuotationSummary, SalesOrderCatalogCache, SalesOrderSummary, StockCache, Supplier, SupplierCatalogCache, VariantCatalogCache, VariantItem } from './types'

export type ManagedCacheId = 'products' | 'variants' | 'uom' | 'prices' | 'priceLists' | 'stock' | 'suppliers' | 'customers' | 'doctypes' | 'salesOrders' | 'posContext' | 'shifts' | 'quotations'

export type ManagedCacheStatus = CacheStatus | 'error'

export type CacheIssue = {
  doctype: string
  operation: string
  message: string
  field?: string
  status?: number
  recoverable: boolean
}

type CacheRefreshOutcome = { issues?: CacheIssue[] }

export type CacheSnapshot<T> = {
  profileId: string
  updatedAt: string
  data: T
}

export type PriceListCacheData = { lists: PriceList[] }
export type PosContextCacheData = { profiles: PosProfile[]; settings: { invoice_type?: 'Sales Invoice' | 'POS Invoice' }; paymentMethods: Record<string, PosPaymentMethod[]>; taxTemplates: Record<string, PosTaxTemplate>; issues?: CacheIssue[] }
export type ShiftCacheData = { user: string; profiles: PosProfile[]; openings: PosOpeningEntry[]; issues?: CacheIssue[] }
export type QuotationCacheData = { company: string; quotations: QuotationSummary[] }

const managementConfig = {
  databaseName: 'mauricio-erpnext-managed-caches',
  version: 1,
  storeName: 'price-lists',
  additionalStoreNames: ['pos-context', 'shifts', 'quotations'],
}

const priceListStore = createCacheStore<CacheSnapshot<PriceListCacheData>>({ ...managementConfig, storeName: 'price-lists' })
const posContextStore = createCacheStore<CacheSnapshot<PosContextCacheData>>({ ...managementConfig, storeName: 'pos-context' })
const shiftStore = createCacheStore<CacheSnapshot<ShiftCacheData>>({ ...managementConfig, storeName: 'shifts' })
const quotationStore = createCacheStore<CacheSnapshot<QuotationCacheData>>({ ...managementConfig, storeName: 'quotations' })

export type ManagedCacheContext = {
  profileId: string
  activeProfile?: PosProfile
  date: string
}

export type ManagedCacheOverview = {
  id: ManagedCacheId
  label: string
  description: string
  doctypes: string[]
  kind: CacheKind
  status: ManagedCacheStatus
  updatedAt?: string
  lastAttemptAt?: string
  lastSuccessAt?: string
  count?: number
  error?: string
  issues?: CacheIssue[]
  requiresContext?: boolean
}

export type HomeCacheData = {
  overview: ManagedCacheOverview[]
  stock: StockCache | null
  salesOrders: SalesOrderCatalogCache | null
  quotations: CacheSnapshot<QuotationCacheData> | null
  shifts: CacheSnapshot<ShiftCacheData> | null
}

const cacheLabels: Record<ManagedCacheId, Omit<ManagedCacheOverview, 'id' | 'status' | 'updatedAt' | 'count' | 'error'>> = {
  products: { label: 'Productos', description: 'Items, SKU, barcode y datos de búsqueda.', doctypes: ['Item', 'Item Barcode'], kind: 'catalog' },
  variants: { label: 'Variantes y atributos', description: 'Plantillas, variantes, atributos y relaciones jerárquicas.', doctypes: ['Item', 'Item Variant Attribute', 'Item Attribute'], kind: 'catalog' },
  uom: { label: 'UOM', description: 'Unidades disponibles y conversiones de Items.', doctypes: ['UOM', 'UOM Conversion Detail'], kind: 'uom' },
  prices: { label: 'Precios', description: 'Tarifas de Item Price para listas de compra y venta.', doctypes: ['Item Price'], kind: 'prices' },
  priceLists: { label: 'Listas de precios', description: 'Listas activas disponibles en ERPNext.', doctypes: ['Price List'], kind: 'prices' },
  stock: { label: 'Inventario', description: 'Empresas, almacenes y existencias reales.', doctypes: ['Company', 'Warehouse', 'Bin'], kind: 'stock' },
  suppliers: { label: 'Proveedores', description: 'Proveedores activos para búsquedas y formularios.', doctypes: ['Supplier'], kind: 'suppliers' },
  customers: { label: 'Clientes', description: 'Clientes activos usados por POS y Sales Orders.', doctypes: ['Customer'], kind: 'customers' },
  doctypes: { label: 'DocTypes', description: 'Catálogo de DocTypes disponibles en ERPNext.', doctypes: ['DocType'], kind: 'doctypes' },
  salesOrders: { label: 'Ventas del día', description: 'Sales Orders de la compañía activa y fecha actual.', doctypes: ['Sales Order'], kind: 'salesOrders', requiresContext: true },
  posContext: { label: 'Configuración POS', description: 'POS Profiles, métodos de pago, impuestos y POS Settings.', doctypes: ['POS Profile', 'POS Payment Method', 'Sales Taxes and Charges Template', 'POS Settings'], kind: 'posContext' },
  shifts: { label: 'Turnos', description: 'Usuario actual, perfiles y aperturas de caja.', doctypes: ['User', 'POS Profile', 'POS Opening Entry'], kind: 'shifts' },
  quotations: { label: 'Cotizaciones', description: 'Cotizaciones de la compañía activa.', doctypes: ['Quotation'], kind: 'quotations', requiresContext: true },
}

const orderFields = ['name', 'customer', 'customer_name', 'company', 'transaction_date', 'delivery_date', 'status', 'docstatus', 'currency', 'selling_price_list', 'grand_total', 'total', 'modified']
const profileFields = ['name', 'company', 'warehouse', 'currency', 'selling_price_list', 'customer', 'tax_category', 'taxes_and_charges', 'disabled', 'allow_rate_change']
const openingFields = ['name', 'user', 'pos_profile', 'company', 'status', 'period_start_date', 'period_end_date', 'posting_date', 'pos_closing_entry', 'docstatus']

function now() { return new Date().toISOString() }
function activeRows<T extends { disabled?: number | boolean }>(rows: T[]) { return rows.filter((row) => row.disabled !== true && row.disabled !== 1 && String(row.disabled) !== '1') }
function countSnapshot(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return undefined
  const data = (snapshot as { data?: unknown }).data
  if (Array.isArray(data)) return data.length
  if (!data || typeof data !== 'object') return undefined
  const arrays = Object.values(data as Record<string, unknown>).filter(Array.isArray) as unknown[][]
  return arrays.reduce((total, rows) => total + rows.length, 0) || undefined
}

type SyncMetadata = { lastAttemptAt?: string; lastSuccessAt?: string; lastError?: string; issues?: CacheIssue[] }

function metadataKey(profileId: string) { return `mauricio-erpnext:cache-sync:${profileId}` }

function readSyncMetadata(profileId: string): Partial<Record<ManagedCacheId, SyncMetadata>> {
  try {
    const value = JSON.parse(localStorage.getItem(metadataKey(profileId)) ?? '{}')
    return value && typeof value === 'object' ? value : {}
  } catch { return {} }
}

function writeSyncMetadata(profileId: string, id: ManagedCacheId, patch: SyncMetadata) {
  const current = readSyncMetadata(profileId)
  current[id] = { ...current[id], ...patch }
  localStorage.setItem(metadataKey(profileId), JSON.stringify(current))
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Error desconocido' }

function forbiddenField(error: unknown) {
  return errorMessage(error).match(/Field not permitted in query:\s*([A-Za-z0-9_]+)/i)?.[1]
}

async function listWithFieldFallback<T>(client: ErpNextClient, doctype: string, fields: string[], options: { filters?: Array<[string, string, unknown]>; orderBy?: string; pageLength?: number }) {
  let remaining = [...fields]
  const issues: CacheIssue[] = []
  while (remaining.length) {
    try {
      return { data: (await client.listDocuments<T>(doctype, { ...options, fields: remaining })).data, issues }
    } catch (error) {
      const field = forbiddenField(error)
      if (!field || !remaining.includes(field)) {
        issues.push({ doctype, operation: 'list', message: errorMessage(error), status: error instanceof ErpNextError ? error.status : undefined, recoverable: false })
        return { data: [] as T[], issues }
      }
      remaining = remaining.filter((candidate) => candidate !== field)
      issues.push({ doctype, operation: 'list', field, message: errorMessage(error), status: error instanceof ErpNextError ? error.status : undefined, recoverable: true })
    }
  }
  return { data: [] as T[], issues }
}

async function readSnapshot<T>(store: ReturnType<typeof createCacheStore<CacheSnapshot<T>>>, profileId: string) {
  return store.read(profileId)
}

async function safeRead<T>(reader: () => Promise<T | null>) {
  try { return await reader() } catch { return null }
}

async function loadItems(client: ErpNextClient, profileId: string, onProgress?: (message: string) => void, since?: string, existingItems: CachedItem[] = []): Promise<ItemCatalogCache> {
  const items: CachedItem[] = []
  let start = 0
  while (true) {
    onProgress?.(`Descargando productos: ${items.length}`)
    const batch = await client.listDocuments<CachedItem>('Item', { fields: ['name', 'item_code', 'item_name', 'brand', 'item_group', 'stock_uom', 'sales_uom', 'purchase_uom', 'weight_per_unit', 'weight_uom', 'variant_of', 'has_variants', 'disabled', 'modified'], ...(since ? { filters: [['modified', '>', since] as [string, string, unknown]] } : {}), start, pageLength: 500, orderBy: 'modified desc' })
    items.push(...batch.data)
    if (batch.data.length < 500) break
    start += batch.data.length
  }
  const details = await readItemSearchDetails(client, items, (message) => onProgress?.(message))
  const changed = items.map((item) => ({ ...item, ...(details[item.name] ?? { barcodes: [] }) }))
  const byName = new Map(existingItems.map((item) => [item.name, item]))
  changed.forEach((item) => byName.set(item.name, { ...byName.get(item.name), ...item }))
  return { profileId, updatedAt: now(), items: Array.from(byName.values()) }
}

async function loadVariants(client: ErpNextClient, profileId: string, onProgress?: (message: string) => void): Promise<VariantCatalogCache> {
  const items: VariantItem[] = []
  let start = 0
  while (true) {
    onProgress?.(`Descargando variantes: ${items.length}`)
    const batch = await client.listDocuments<VariantItem>('Item', { fields: ['name', 'item_code', 'item_name', 'brand', 'item_group', 'stock_uom', 'sales_uom', 'purchase_uom', 'weight_per_unit', 'weight_uom', 'variant_of', 'has_variants', 'disabled', 'is_stock_item', 'has_serial_no', 'has_batch_no'], start, pageLength: 500, orderBy: 'item_name asc' })
    items.push(...batch.data)
    if (batch.data.length < 500) break
    start += batch.data.length
  }
  const searchDetails = await readItemSearchDetails(client, items, (message) => onProgress?.(message))
  const attributeDetails = await readItemVariantAttributes(client, items, (message) => onProgress?.(message))
  const enriched = items.map((item) => ({ ...item, ...(searchDetails[item.name] ?? { barcodes: [] }), attributes: attributeDetails[item.name] ?? [] }))
  let rows: Array<{ parent: string; uom: string; conversion_factor: number }> = []
  try {
    let uomStart = 0
    while (true) {
      onProgress?.(`Descargando conversiones UOM: ${rows.length}`)
      const batch = await client.listDocuments<{ parent: string; uom: string; conversion_factor: number }>('UOM Conversion Detail', { fields: ['parent', 'uom', 'conversion_factor'], filters: [['parenttype', '=', 'Item'], ['parentfield', '=', 'uoms']], start: uomStart, pageLength: 500, orderBy: 'parent asc, idx asc' })
      rows.push(...batch.data)
      if (batch.data.length < 500) break
      uomStart += batch.data.length
    }
  } catch (error) {
    if (!(error instanceof ErpNextError) || error.status !== 403) throw error
    onProgress?.('Sin permiso para leer UOM directamente; usando los Items…')
    rows = await readItemUomsThroughItems(client, enriched, (message) => onProgress?.(message))
  }
  return { profileId, updatedAt: now(), items: mergeItemUoms(enriched, rows) }
}

export async function readManagedCacheOverviews(profileId: string): Promise<ManagedCacheOverview[]> {
  const [products, variants, uom, prices, priceLists, stock, suppliers, customers, doctypes, salesOrders, posContext, shifts, quotations] = await Promise.all([
    safeRead(() => readItemCatalog(profileId)), safeRead(() => readVariantCatalog(profileId)), safeRead(() => readUomCatalog(profileId)), safeRead(() => readItemPriceCatalog(profileId)), safeRead(() => readSnapshot(priceListStore, profileId)), safeRead(() => readStockCache(profileId)), safeRead(() => readSupplierCatalog(profileId)), safeRead(() => readCustomerCatalog(profileId)), safeRead(() => readDocTypeCatalog(profileId)), safeRead(() => readSalesOrderCatalog(profileId)), safeRead(() => readSnapshot(posContextStore, profileId)), safeRead(() => readSnapshot(shiftStore, profileId)), safeRead(() => readSnapshot(quotationStore, profileId)),
  ])
  const snapshots: Record<ManagedCacheId, { updatedAt?: string; count?: number }> = {
    products: { updatedAt: products?.updatedAt, count: products?.items.length },
    variants: { updatedAt: variants?.updatedAt, count: variants?.items.length },
    uom: { updatedAt: uom?.updatedAt, count: uom?.uoms.length },
    prices: { updatedAt: prices?.updatedAt, count: prices?.prices.length },
    priceLists: { updatedAt: priceLists?.updatedAt, count: countSnapshot(priceLists) },
    stock: { updatedAt: stock?.updatedAt, count: stock?.bins.length },
    suppliers: { updatedAt: suppliers?.updatedAt, count: suppliers?.suppliers.length },
    customers: { updatedAt: customers?.updatedAt, count: customers?.customers.length },
    doctypes: { updatedAt: doctypes?.updatedAt, count: doctypes?.doctypes.length },
    salesOrders: { updatedAt: salesOrders?.updatedAt, count: salesOrders?.buckets.reduce((total, bucket) => total + bucket.salesOrders.length, 0) },
    posContext: { updatedAt: posContext?.updatedAt, count: countSnapshot(posContext) },
    shifts: { updatedAt: shifts?.updatedAt, count: countSnapshot(shifts) },
    quotations: { updatedAt: quotations?.updatedAt, count: countSnapshot(quotations) },
  }
  const metadata = readSyncMetadata(profileId)
  return (Object.keys(cacheLabels) as ManagedCacheId[]).map((id) => {
    const sync = metadata[id]
    const error = sync?.lastError
    const snapshot = id === 'posContext' ? posContext : id === 'shifts' ? shifts : undefined
    const issues = sync?.issues ?? (snapshot?.data as { issues?: CacheIssue[] } | undefined)?.issues
    const hasFailedAttempt = Boolean(error)
    return { id, ...cacheLabels[id], updatedAt: snapshots[id].updatedAt, lastAttemptAt: sync?.lastAttemptAt, lastSuccessAt: sync?.lastSuccessAt ?? snapshots[id].updatedAt, count: snapshots[id].count, error, issues, status: hasFailedAttempt ? 'error' : snapshots[id].updatedAt ? getCacheStatus(cacheLabels[id].kind, { updatedAt: snapshots[id].updatedAt }) : 'missing' }
  })
}

export async function readHomeCacheData(profileId: string): Promise<HomeCacheData> {
  const [overview, stock, salesOrders, quotations, shifts] = await Promise.all([
    readManagedCacheOverviews(profileId),
    safeRead(() => readStockCache(profileId)),
    safeRead(() => readSalesOrderCatalog(profileId)),
    safeRead(() => readSnapshot(quotationStore, profileId)),
    safeRead(() => readSnapshot(shiftStore, profileId)),
  ])
  return { overview, stock, salesOrders, quotations, shifts }
}

async function refreshProducts(client: ErpNextClient, profileId: string, onProgress?: (message: string) => void) {
  const cached = await readItemCatalog(profileId)
  const next = await loadItems(client, profileId, onProgress, cached?.updatedAt, cached?.items)
  await writeItemCatalog(next)
  const variantCache = await readVariantCatalog(profileId)
  if (!variantCache?.items.length) await writeVariantCatalog({ profileId, updatedAt: next.updatedAt, items: next.items as VariantItem[] })
  return next
}

async function refreshPrices(client: ErpNextClient, profileId: string, onProgress?: (message: string) => void) {
  const cached = await readItemPriceCatalog(profileId)
  const prices = await listAllDocuments<ItemPrice>(client, 'Item Price', { fields: ['name', 'item_code', 'price_list', 'price_list_rate', 'buying', 'selling', 'uom', 'currency', 'customer', 'supplier', 'valid_from', 'valid_upto', 'modified'], ...(cached ? { filters: [['modified', '>', cached.updatedAt] as [string, string, unknown]] } : {}), orderBy: 'item_code asc, price_list asc' }, (count) => onProgress?.(`${cached ? 'Sincronizando' : 'Descargando'} precios: ${count}`))
  const byName = new Map((cached?.prices ?? []).map((price) => [price.name, price]))
  prices.forEach((price) => byName.set(price.name, { ...byName.get(price.name), ...price }))
  const next: ItemPriceCatalogCache = { profileId, updatedAt: now(), prices: Array.from(byName.values()) }
  return writeItemPriceCatalog(next)
}

async function refreshPriceLists(client: ErpNextClient, profileId: string) {
  const lists = (await client.listDocuments<PriceList>('Price List', { fields: ['name', 'selling', 'buying', 'enabled'], pageLength: 500, orderBy: 'name asc' })).data
  return priceListStore.write({ profileId, updatedAt: now(), data: { lists } })
}

async function refreshPosContext(client: ErpNextClient, profileId: string, retryOnly = false): Promise<CacheRefreshOutcome> {
  const previous = await readSnapshot(posContextStore, profileId)
  const issues: CacheIssue[] = []
  const targets = new Set(previous?.data.issues?.map((issue) => issue.doctype) ?? [])
  const profileResult = retryOnly && previous && !targets.has('POS Profile') ? { data: previous.data.profiles, issues: [] } : await listWithFieldFallback<PosProfile>(client, 'POS Profile', profileFields, { pageLength: 100, orderBy: 'name asc' })
  issues.push(...profileResult.issues)
  const profiles = activeRows(profileResult.data.length ? profileResult.data : previous?.data.profiles ?? [])
  let settings = previous?.data.settings ?? {}
  if (!retryOnly || targets.has('POS Settings') || !previous) { try { settings = await client.getDocument<{ invoice_type?: 'Sales Invoice' | 'POS Invoice' }>('POS Settings', 'POS Settings') } catch (error) { issues.push({ doctype: 'POS Settings', operation: 'read', message: errorMessage(error), status: error instanceof ErpNextError ? error.status : undefined, recoverable: false }) } }
  const paymentMethods: Record<string, PosPaymentMethod[]> = {}
  const taxTemplates: Record<string, PosTaxTemplate> = {}
  for (const profile of profiles) {
    const previousPayments = previous?.data.paymentMethods[profile.name] ?? []
    if (retryOnly && previous && !targets.has('POS Payment Method')) paymentMethods[profile.name] = previousPayments
    else try {
      const full = await client.getDocument<PosProfile>('POS Profile', profile.name)
      if (full.payments?.length) paymentMethods[profile.name] = full.payments
      else paymentMethods[profile.name] = (await client.listDocuments<PosPaymentMethod>('POS Payment Method', { fields: ['name', 'parent', 'parenttype', 'parentfield', 'mode_of_payment', 'default', 'allow_in_returns'], filters: [['parent', '=', profile.name], ['parenttype', '=', 'POS Profile'], ['parentfield', '=', 'payments']], pageLength: 100, orderBy: 'idx asc' })).data
    } catch (error) { paymentMethods[profile.name] = previousPayments; issues.push({ doctype: 'POS Payment Method', operation: `read:${profile.name}`, message: errorMessage(error), status: error instanceof ErpNextError ? error.status : undefined, recoverable: true }) }
    if (profile.taxes_and_charges && (!retryOnly || targets.has('Sales Taxes and Charges Template') || !previous)) {
      try { taxTemplates[profile.taxes_and_charges] = await client.getDocument<PosTaxTemplate>('Sales Taxes and Charges Template', profile.taxes_and_charges) } catch (error) { const previousTax = previous?.data.taxTemplates[profile.taxes_and_charges]; if (previousTax) taxTemplates[profile.taxes_and_charges] = previousTax; issues.push({ doctype: 'Sales Taxes and Charges Template', operation: `read:${profile.taxes_and_charges}`, message: errorMessage(error), status: error instanceof ErpNextError ? error.status : undefined, recoverable: true }) }
    }
  }
  const data = { profiles, settings, paymentMethods: { ...previous?.data.paymentMethods, ...paymentMethods }, taxTemplates: { ...previous?.data.taxTemplates, ...taxTemplates }, issues: issues.length ? issues : undefined }
  await posContextStore.write({ profileId, updatedAt: now(), data })
  return { issues: issues.length ? issues : undefined }
}

async function refreshShifts(client: ErpNextClient, profileId: string, retryOnly = false): Promise<CacheRefreshOutcome> {
  const previous = await readSnapshot(shiftStore, profileId)
  const issues: CacheIssue[] = []
  const targets = new Set(previous?.data.issues?.map((issue) => issue.doctype) ?? [])
  let user = previous?.data.user ?? ''
  if (!retryOnly || targets.has('User') || !previous) { try { user = await client.getCurrentUser() } catch (error) { issues.push({ doctype: 'User', operation: 'current', message: errorMessage(error), status: error instanceof ErpNextError ? error.status : undefined, recoverable: true }) } }
  const profileResult = retryOnly && previous && !targets.has('POS Profile') ? { data: previous.data.profiles, issues: [] } : await listWithFieldFallback<PosProfile>(client, 'POS Profile', profileFields, { pageLength: 100, orderBy: 'name asc' })
  issues.push(...profileResult.issues)
  const profiles = activeRows(profileResult.data.length ? profileResult.data : previous?.data.profiles ?? [])
  let openings = previous?.data.openings ?? []
  if (!retryOnly || targets.has('POS Opening Entry') || !previous) { try { openings = (await client.listDocuments<PosOpeningEntry>('POS Opening Entry', { fields: openingFields, pageLength: 100, orderBy: 'creation desc' })).data.filter((entry) => entry.status === 'Open') } catch (error) { issues.push({ doctype: 'POS Opening Entry', operation: 'list', message: errorMessage(error), status: error instanceof ErpNextError ? error.status : undefined, recoverable: true }) } }
  await shiftStore.write({ profileId, updatedAt: now(), data: { user, profiles, openings, issues: issues.length ? issues : undefined } })
  return { issues: issues.length ? issues : undefined }
}

export async function refreshManagedCache(id: ManagedCacheId, context: ManagedRefreshContext, onProgress?: (message: string) => void, retryOnly = false) {
  const { profileId, activeProfile, date } = context
  switch (id) {
    case 'products': return refreshProducts(context.client, profileId, onProgress)
    case 'variants': return writeVariantCatalog(await loadVariants(context.client, profileId, onProgress))
    case 'uom': { const cached = await readUomCatalog(profileId); const next = await syncUomCatalog(context.client, profileId, cached, true); return writeUomCatalog(next) }
    case 'prices': return refreshPrices(context.client, profileId, onProgress)
    case 'priceLists': return refreshPriceLists(context.client, profileId)
    case 'stock': { const data = await loadStockData(context.client, onProgress); return writeStockCache({ profileId, updatedAt: now(), ...data }) }
    case 'suppliers': { const suppliers = await listAllDocuments<Supplier>(context.client, 'Supplier', { fields: ['name', 'supplier_name', 'supplier_group', 'supplier_type', 'country', 'disabled'], orderBy: 'supplier_name asc' }, (count) => onProgress?.(`Descargando proveedores: ${count}`)); const next: SupplierCatalogCache = { profileId, updatedAt: now(), suppliers }; return writeSupplierCatalog(next) }
    case 'doctypes': { const doctypes = await listAllDocuments<{ name: string }>(context.client, 'DocType', { fields: ['name'], orderBy: 'name asc' }, (count) => onProgress?.(`Descargando DocTypes: ${count}`)); const next: DocTypeCatalogCache = { profileId, updatedAt: now(), doctypes }; return writeDocTypeCatalog(next) }
    case 'customers': { const customers = (await context.client.listDocuments<CustomerSummary>('Customer', { fields: ['name', 'customer_name', 'customer_group', 'territory', 'default_price_list', 'default_currency', 'disabled'], filters: [['disabled', '=', 0]], pageLength: 500, orderBy: 'customer_name asc' })).data; return writeCustomerCatalog({ profileId, updatedAt: now(), customers }) }
    case 'salesOrders': {
      if (!activeProfile?.company) throw new Error('Selecciona o configura un POS Profile con compañía para refrescar ventas.')
      const rows = await context.client.listDocuments<SalesOrderSummary>('Sales Order', { fields: orderFields, filters: [['company', '=', activeProfile.company], ['transaction_date', '=', date]], pageLength: 500, orderBy: 'modified desc' })
      const normalized = rows.data.map(normalizeSalesOrder)
      const cache = await readSalesOrderCatalog(profileId)
      return writeSalesOrderCatalog(upsertSalesOrderBucket(cache, { company: activeProfile.company, date, updatedAt: now(), salesOrders: normalized }, profileId))
    }
    case 'posContext': return refreshPosContext(context.client, profileId, retryOnly)
    case 'shifts': return refreshShifts(context.client, profileId, retryOnly)
    case 'quotations': {
      if (!activeProfile?.company) throw new Error('Selecciona o configura un POS Profile con compañía para refrescar cotizaciones.')
      const quotations = (await context.client.listDocuments<QuotationSummary>('Quotation', { fields: ['name', 'docstatus', 'quotation_to', 'party_name', 'customer_name', 'company', 'transaction_date', 'delivery_date', 'valid_till', 'status', 'currency', 'grand_total', 'modified'], filters: [['company', '=', activeProfile.company], ['docstatus', 'in', [0, 1]],], pageLength: 500, orderBy: 'modified desc' })).data
      return quotationStore.write({ profileId, updatedAt: now(), data: { company: activeProfile.company, quotations } })
    }
  }
}

export type ManagedRefreshContext = ManagedCacheContext & { client: ErpNextClient }

export async function runManagedCacheRefresh(id: ManagedCacheId, context: ManagedRefreshContext, onProgress?: (message: string) => void, retryOnly = false) {
  const attemptAt = now()
  writeSyncMetadata(context.profileId, id, { lastAttemptAt: attemptAt, lastError: undefined, issues: undefined })
  try {
    const result = await refreshManagedCache(id, context, onProgress, retryOnly)
    const outcome = result as CacheRefreshOutcome | undefined
    writeSyncMetadata(context.profileId, id, { lastAttemptAt: attemptAt, lastSuccessAt: now(), lastError: outcome?.issues?.length ? `${outcome.issues.length} subconsultas con error` : undefined, issues: outcome?.issues })
    return result
  } catch (error) {
    writeSyncMetadata(context.profileId, id, { lastAttemptAt: attemptAt, lastError: errorMessage(error), issues: undefined })
    throw error
  }
}

export function cacheTtlLabel(id: ManagedCacheId) {
  const kind = cacheLabels[id].kind
  const minutes = Math.round(CACHE_TTL_MS[kind] / 60_000)
  return minutes >= 60 ? `${Math.round(minutes / 60)} h` : `${minutes} min`
}

export async function cacheCount(profileId: string, id: ManagedCacheId) {
  const rows = await readManagedCacheOverviews(profileId)
  return rows.find((row) => row.id === id)?.count
}
