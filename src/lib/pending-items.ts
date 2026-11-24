import type { ItemPrice, StockBin, VariantItem, Warehouse } from './types'

export type PendingPriceKind = 'buying' | 'selling'
export type PendingItem = {
  item: VariantItem
  kind: 'item' | 'template' | 'variant'
  /** Prices with no general Item Price for the item or its template. */
  missingPrices: PendingPriceKind[]
  /** Prices the variant lacks but ERPNext resolves from its template in orders and invoices (the POS does not). */
  inheritedPrices: PendingPriceKind[]
}

/** `purchaseCost` is the purchase price converted to the selling price's UOM. */
export type LowMarginPrice = { item: VariantItem; selling: ItemPrice; purchase: ItemPrice; purchaseCost: number; marginPercentage: number }
export type PendingStockItem = { item: VariantItem; actualQty: number; projectedQty: number; safetyStock: number; status: 'out' | 'low' }
export type IncompleteCatalogField = 'item_group' | 'stock_uom' | 'brand'
/** `missingFields` are required; `optionalFields` (brand) are a low-priority note. */
export type IncompleteCatalogItem = { item: VariantItem; missingFields: IncompleteCatalogField[]; optionalFields: IncompleteCatalogField[] }
export type MissingImageItem = { item: VariantItem; kind: 'item' | 'template' | 'variant' }

function todayLocal() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function notDisabled(value: number | boolean | undefined) {
  return value !== true && value !== 1 && String(value) !== '1'
}

function isFlagSet(value: number | boolean | undefined) {
  return value === true || value === 1 || String(value) === '1'
}

/** Treats a missing flag (caches built before the field was loaded) as set, matching ERPNext's defaults. */
function flagOrDefault(value: number | boolean | undefined) {
  return value === undefined || value === null || isFlagSet(value)
}

/** Without a customer, supplier or batch, ERPNext only applies Item Prices that name none of them. */
export function isGeneralPrice(price: ItemPrice) {
  return !price.customer?.trim() && !price.supplier?.trim() && !price.batch_no?.trim()
}

export function findStockShortages(items: VariantItem[], bins: StockBin[], warehouses: Warehouse[], warehouse?: string): PendingStockItem[] {
  const children = new Set(items.flatMap((item) => item.variant_of ? [item.variant_of] : []))
  const activeLeafWarehouses = new Set(warehouses.filter((warehouse) => notDisabled(warehouse.disabled) && !isFlagSet(warehouse.is_group)).map((warehouse) => warehouse.name))
  const quantities = new Map<string, { actualQty: number; projectedQty: number }>()
  for (const bin of bins) {
    if (warehouses.length && !activeLeafWarehouses.has(bin.warehouse)) continue
    if (warehouse && bin.warehouse !== warehouse) continue
    const current = quantities.get(bin.item_code) ?? { actualQty: 0, projectedQty: 0 }
    current.actualQty += Number(bin.actual_qty ?? 0)
    current.projectedQty += Number(bin.projected_qty ?? bin.actual_qty ?? 0)
    quantities.set(bin.item_code, current)
  }
  return items.flatMap((item) => {
    if (!notDisabled(item.disabled) || !isFlagSet(item.is_stock_item) || isFlagSet(item.has_variants) || children.has(item.name)) return []
    const quantity = quantities.get(item.name) ?? { actualQty: 0, projectedQty: 0 }
    const safetyStockValue = Number(item.safety_stock ?? 0)
    const safetyStock = Number.isFinite(safetyStockValue) ? Math.max(0, safetyStockValue) : 0
    const status: PendingStockItem['status'] | null = quantity.actualQty <= 0 ? 'out' : safetyStock > 0 && quantity.projectedQty < safetyStock ? 'low' : null
    return status ? [{ item, ...quantity, safetyStock, status }] : []
  }).sort((left, right) => left.actualQty - right.actualQty || (left.item.item_name || left.item.name).localeCompare(right.item.item_name || right.item.name, 'es'))
}

export function findIncompleteCatalogItems(items: VariantItem[]): IncompleteCatalogItem[] {
  return items.flatMap((item) => {
    if (!notDisabled(item.disabled)) return []
    const missingFields: IncompleteCatalogField[] = []
    if (!item.item_group?.trim()) missingFields.push('item_group')
    if (!item.stock_uom?.trim()) missingFields.push('stock_uom')
    const optionalFields: IncompleteCatalogField[] = item.brand?.trim() ? [] : ['brand']
    return missingFields.length || optionalFields.length ? [{ item, missingFields, optionalFields }] : []
  }).sort((left, right) => right.missingFields.length - left.missingFields.length || (left.item.item_name || left.item.name).localeCompare(right.item.item_name || right.item.name, 'es'))
}

export function findMissingImages(items: VariantItem[]): MissingImageItem[] {
  const templates = new Set(items.filter((item) => isFlagSet(item.has_variants)).map((item) => item.name))
  items.forEach((item) => { if (item.variant_of) templates.add(item.variant_of) })
  return items.filter((item) => notDisabled(item.disabled) && !item.image?.trim()).map((item) => ({
    item,
    kind: item.variant_of ? 'variant' as const : templates.has(item.name) ? 'template' as const : 'item' as const,
  }))
}

function activePrice(price: ItemPrice, today: string) {
  return (!price.valid_from || price.valid_from <= today) && (!price.valid_upto || price.valid_upto >= today)
}

export function findPendingItems(items: VariantItem[], prices: ItemPrice[], lists: { buying: string; selling: string }, today = todayLocal()): PendingItem[] {
  const children = new Map<string, number>()
  items.forEach((item) => { if (item.variant_of) children.set(item.variant_of, (children.get(item.variant_of) ?? 0) + 1) })
  const pricesByItem = new Map<string, ItemPrice[]>()
  prices.forEach((price) => {
    if (!price.item_code || !isGeneralPrice(price) || !activePrice(price, today)) return
    pricesByItem.set(price.item_code, [...(pricesByItem.get(price.item_code) ?? []), price])
  })
  const hasPrice = (itemCode: string, kind: PendingPriceKind) => (pricesByItem.get(itemCode) ?? []).some((price) => isFlagSet(price[kind]) && price.price_list === lists[kind])
  const pending: PendingItem[] = []
  for (const item of items) {
    if (!notDisabled(item.disabled)) continue
    const hasVariants = isFlagSet(item.has_variants) || (children.get(item.name) ?? 0) > 0
    const kind = item.variant_of ? 'variant' : hasVariants ? 'template' : 'item'
    if (kind === 'template') {
      if ((children.get(item.name) ?? 0) === 0) pending.push({ item, kind, missingPrices: [], inheritedPrices: [] })
      continue
    }

    const required: PendingPriceKind[] = [...(flagOrDefault(item.is_purchase_item) ? ['buying' as const] : []), ...(flagOrDefault(item.is_sales_item) ? ['selling' as const] : [])]
    const missingPrices: PendingPriceKind[] = []
    const inheritedPrices: PendingPriceKind[] = []
    for (const priceKind of required) {
      if (hasPrice(item.name, priceKind)) continue
      if (item.variant_of && hasPrice(item.variant_of, priceKind)) inheritedPrices.push(priceKind)
      else missingPrices.push(priceKind)
    }
    if (missingPrices.length || inheritedPrices.length) pending.push({ item, kind, missingPrices, inheritedPrices })
  }
  // Inherited-only rows are lower priority: ERPNext still prices them outside the POS.
  return pending.sort((left, right) => Number(!left.missingPrices.length) - Number(!right.missingPrices.length))
}

/** Units of the stock UOM in one `uom`; `undefined` when the item has no conversion for it. */
function stockFactor(item: VariantItem, uom: string | undefined) {
  if (!uom || uom === item.stock_uom) return 1
  const factor = Number(item.uoms?.find((candidate) => candidate.uom === uom)?.conversion_factor)
  return Number.isFinite(factor) && factor > 0 ? factor : undefined
}

/**
 * Returns every active general sale price whose margin against the highest comparable cost in the buying
 * list is at or below the threshold. Prices in different UOMs are compared per stock unit.
 */
export function findLowMarginPrices(items: VariantItem[], prices: ItemPrice[], options: { threshold: number; buyingPriceList: string }, today = todayLocal()): LowMarginPrice[] {
  const itemByName = new Map(items.map((item) => [item.name, item]))
  const active = prices.filter((price) => activePrice(price, today) && isGeneralPrice(price) && Number.isFinite(Number(price.price_list_rate)))
  const buying = active.filter((price) => isFlagSet(price.buying) && price.price_list === options.buyingPriceList)
  const lowMargin: LowMarginPrice[] = []
  for (const selling of active.filter((price) => isFlagSet(price.selling))) {
    const item = itemByName.get(selling.item_code ?? '')
    if (!item || !notDisabled(item.disabled)) continue
    const saleRate = Number(selling.price_list_rate)
    if (saleRate <= 0) continue
    const unitCost = (purchase: ItemPrice) => {
      if ((purchase.uom || '') === (selling.uom || '')) return Number(purchase.price_list_rate)
      const purchaseFactor = stockFactor(item, purchase.uom)
      const saleFactor = stockFactor(item, selling.uom)
      return purchaseFactor && saleFactor ? Number(purchase.price_list_rate) / purchaseFactor * saleFactor : undefined
    }
    let purchase: ItemPrice | undefined
    let cost = -Infinity
    for (const candidate of buying) {
      if (candidate.item_code !== selling.item_code || (candidate.currency || 'MXN') !== (selling.currency || 'MXN')) continue
      const candidateCost = unitCost(candidate)
      if (candidateCost !== undefined && candidateCost > cost) { purchase = candidate; cost = candidateCost }
    }
    if (!purchase) continue
    const marginPercentage = ((saleRate - cost) / saleRate) * 100
    if (marginPercentage <= options.threshold) lowMargin.push({ item, selling, purchase, purchaseCost: cost, marginPercentage })
  }
  return lowMargin.sort((left, right) => left.marginPercentage - right.marginPercentage || (left.item.item_name || left.item.name).localeCompare(right.item.item_name || right.item.name))
}
