import type { ItemPrice, StockBin, VariantItem, Warehouse } from './types'

export type PendingPriceKind = 'buying' | 'selling'
export type PendingItem = {
  item: VariantItem
  kind: 'item' | 'template' | 'variant'
  missingPrices: PendingPriceKind[]
}

export type LowMarginPrice = { item: VariantItem; selling: ItemPrice; purchase: ItemPrice; marginPercentage: number }
export type PendingStockItem = { item: VariantItem; actualQty: number; projectedQty: number; safetyStock: number; status: 'out' | 'low' }
export type IncompleteCatalogField = 'item_group' | 'stock_uom' | 'brand'
export type IncompleteCatalogItem = { item: VariantItem; missingFields: IncompleteCatalogField[] }

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

export function findStockShortages(items: VariantItem[], bins: StockBin[], warehouses: Warehouse[]): PendingStockItem[] {
  const children = new Set(items.flatMap((item) => item.variant_of ? [item.variant_of] : []))
  const activeLeafWarehouses = new Set(warehouses.filter((warehouse) => notDisabled(warehouse.disabled) && !isFlagSet(warehouse.is_group)).map((warehouse) => warehouse.name))
  const quantities = new Map<string, { actualQty: number; projectedQty: number }>()
  for (const bin of bins) {
    if (warehouses.length && !activeLeafWarehouses.has(bin.warehouse)) continue
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
    if (!item.brand?.trim()) missingFields.push('brand')
    return missingFields.length ? [{ item, missingFields }] : []
  }).sort((left, right) => right.missingFields.length - left.missingFields.length || (left.item.item_name || left.item.name).localeCompare(right.item.item_name || right.item.name, 'es'))
}

function activePrice(price: ItemPrice, today: string) {
  return (!price.valid_from || price.valid_from <= today) && (!price.valid_upto || price.valid_upto >= today)
}

export function findPendingItems(items: VariantItem[], prices: ItemPrice[], lists: { buying: string; selling: string }, today = todayLocal()): PendingItem[] {
  const children = new Map<string, number>()
  items.forEach((item) => { if (item.variant_of) children.set(item.variant_of, (children.get(item.variant_of) ?? 0) + 1) })
  const pending: PendingItem[] = []
  for (const item of items) {
    if (!notDisabled(item.disabled)) continue
    const hasVariants = isFlagSet(item.has_variants) || (children.get(item.name) ?? 0) > 0
    const isVariant = Boolean(item.variant_of)
    const isTemplate = hasVariants
    const kind = isVariant ? 'variant' : isTemplate ? 'template' : 'item'
    if (kind === 'template') {
      if ((children.get(item.name) ?? 0) === 0) pending.push({ item, kind, missingPrices: [] })
      continue
    }

    const matchingPrices = prices.filter((price) => price.item_code === item.name && activePrice(price, today))
    const missingPrices: PendingPriceKind[] = []
    if (!matchingPrices.some((price) => isFlagSet(price.buying) && price.price_list === lists.buying)) missingPrices.push('buying')
    if (!matchingPrices.some((price) => isFlagSet(price.selling) && price.price_list === lists.selling)) missingPrices.push('selling')
    if (missingPrices.length) pending.push({ item, kind, missingPrices })
  }
  return pending
}

/** Returns every active sale price whose margin against the highest compatible Standard Buying cost is at or below the threshold. */
export function findLowMarginPrices(items: VariantItem[], prices: ItemPrice[], threshold: number, today = todayLocal()): LowMarginPrice[] {
  const itemByName = new Map(items.map((item) => [item.name, item]))
  const active = prices.filter((price) => activePrice(price, today) && Number.isFinite(Number(price.price_list_rate)))
  const buying = active.filter((price) => isFlagSet(price.buying) && price.price_list === 'Standard Buying')
  const lowMargin: LowMarginPrice[] = []
  for (const selling of active.filter((price) => isFlagSet(price.selling))) {
    const item = itemByName.get(selling.item_code ?? '')
    if (!item || !notDisabled(item.disabled)) continue
    const candidates = buying.filter((purchase) => purchase.item_code === selling.item_code
      && (purchase.uom || '') === (selling.uom || '')
      && (purchase.currency || 'MXN') === (selling.currency || 'MXN'))
    if (!candidates.length) continue
    const purchase = candidates.reduce((highest, candidate) => Number(candidate.price_list_rate) > Number(highest.price_list_rate) ? candidate : highest)
    const saleRate = Number(selling.price_list_rate)
    if (saleRate <= 0) continue
    const marginPercentage = ((saleRate - Number(purchase.price_list_rate)) / saleRate) * 100
    if (marginPercentage <= threshold) lowMargin.push({ item, selling, purchase, marginPercentage })
  }
  return lowMargin.sort((left, right) => left.marginPercentage - right.marginPercentage || (left.item.item_name || left.item.name).localeCompare(right.item.item_name || right.item.name))
}
