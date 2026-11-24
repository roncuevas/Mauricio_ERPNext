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
/** A product with no image, or a template family where the template or any active variant lacks one. */
export type MissingImageGroup =
  | { kind: 'item'; item: VariantItem }
  | { kind: 'family'; template: VariantItem; variants: VariantItem[]; missingVariants: VariantItem[]; variantsWithImage: VariantItem[]; templateMissing: boolean }

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

const hasImage = (item: VariantItem) => Boolean(item.image?.trim())
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function findMissingImageGroups(items: VariantItem[]): MissingImageGroup[] {
  const active = items.filter((item) => notDisabled(item.disabled))
  const byName = new Map(active.map((item) => [item.name, item]))
  const variantsByTemplate = new Map<string, VariantItem[]>()
  for (const item of active) {
    if (!item.variant_of || !byName.has(item.variant_of)) continue
    variantsByTemplate.set(item.variant_of, [...(variantsByTemplate.get(item.variant_of) ?? []), item])
  }
  const groups: MissingImageGroup[] = []
  for (const item of active) {
    if (item.variant_of && byName.has(item.variant_of)) continue
    const variants = (variantsByTemplate.get(item.name) ?? []).sort((a, b) => collator.compare(a.item_name || a.name, b.item_name || b.name))
    if (!variants.length) {
      if (!hasImage(item)) groups.push({ kind: 'item', item })
      continue
    }
    const missingVariants = variants.filter((variant) => !hasImage(variant))
    const templateMissing = !hasImage(item)
    if (templateMissing || missingVariants.length) groups.push({ kind: 'family', template: item, variants, missingVariants, variantsWithImage: variants.filter(hasImage), templateMissing })
  }
  return groups
}

export type MissingImageView = 'tree' | 'list' | 'templates' | 'variants'
export const MISSING_IMAGE_VIEWS: MissingImageView[] = ['tree', 'list', 'templates', 'variants']
type MissingImageFamily = Extract<MissingImageGroup, { kind: 'family' }>
/** One item without an image, for the flat views; `family` is set for templates and variants. */
export type MissingImageRow = { item: VariantItem; role: 'item' | 'template' | 'variant'; family?: MissingImageFamily }

/**
 * Gaps a family can fill from an image it already has: `toVariants` when the template has one and variants lack it,
 * `toTemplate` when the template lacks one and a variant has it.
 */
export type ImageInheritance = 'toVariants' | 'toTemplate'
export const IMAGE_INHERITANCES: ImageInheritance[] = ['toVariants', 'toTemplate']

/** Keeps the families that can fill their gaps in that direction; loose products never can. */
export function filterByInheritance(groups: MissingImageGroup[], inheritance: ImageInheritance): MissingImageGroup[] {
  return groups.filter((group) => group.kind === 'family' && (inheritance === 'toVariants'
    ? !group.templateMissing && group.missingVariants.length > 0
    : group.templateMissing && group.variantsWithImage.length > 0))
}

/**
 * Flattens the groups into the items that lack an image, keeping only templates or variants when asked. With an
 * `inheritance` it keeps only the items that direction fills: variants for `toVariants`, templates for `toTemplate`.
 */
export function missingImageRows(groups: MissingImageGroup[], view: Exclude<MissingImageView, 'tree'> = 'list', inheritance?: ImageInheritance): MissingImageRow[] {
  const rows: MissingImageRow[] = []
  for (const group of groups) {
    if (group.kind === 'item') { if (view === 'list' && !inheritance) rows.push({ item: group.item, role: 'item' }); continue }
    if (group.templateMissing && view !== 'variants' && inheritance !== 'toVariants') rows.push({ item: group.template, role: 'template', family: group })
    if (view !== 'templates' && inheritance !== 'toTemplate') rows.push(...group.missingVariants.map((item) => ({ item, role: 'variant' as const, family: group })))
  }
  return rows
}

/** Items without an image; with an `inheritance`, only those that direction would fill. */
export function countMissingImages(groups: MissingImageGroup[], inheritance?: ImageInheritance) {
  return groups.reduce((total, group) => {
    if (group.kind === 'item') return total + (inheritance ? 0 : 1)
    if (inheritance === 'toTemplate') return total + Number(group.templateMissing)
    if (inheritance === 'toVariants') return total + group.missingVariants.length
    return total + group.missingVariants.length + Number(group.templateMissing)
  }, 0)
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

export type PendingCategory = 'prices' | 'templates' | 'margin' | 'images' | 'stock' | 'data'
export const PENDING_CATEGORIES: PendingCategory[] = ['prices', 'templates', 'margin', 'images', 'stock', 'data']

/**
 * How many items each pending category holds. Inherited prices and a missing brand are listed but do not count;
 * a category whose source is not downloaded (images before the image field, stock before the inventory) is `null`.
 */
export function countPending({ pending, lowMargins, imageGroups, stockShortages, incompleteItems }: { pending: PendingItem[]; lowMargins: LowMarginPrice[]; imageGroups: MissingImageGroup[] | null; stockShortages: PendingStockItem[] | null; incompleteItems: IncompleteCatalogItem[] }): Record<PendingCategory, number | null> {
  return {
    prices: pending.filter((row) => row.kind !== 'template' && row.missingPrices.length > 0).length,
    templates: pending.filter((row) => row.kind === 'template').length,
    margin: lowMargins.length,
    images: imageGroups ? countMissingImages(imageGroups) : null,
    stock: stockShortages ? stockShortages.length : null,
    data: incompleteItems.filter((row) => row.missingFields.length > 0).length,
  }
}

/** Pending counts for the whole catalog and every warehouse, as the home page summarizes them. */
export function summarizePending({ items, prices, stock, imagesReady, preferences }: { items: VariantItem[]; prices: ItemPrice[]; stock: { bins: StockBin[]; warehouses: Warehouse[] } | null; imagesReady: boolean; preferences: { buyingPriceList: string; sellingPriceList: string; lowMarginThreshold: number } }, today = todayLocal()) {
  return countPending({
    pending: findPendingItems(items, prices, { buying: preferences.buyingPriceList, selling: preferences.sellingPriceList }, today),
    lowMargins: findLowMarginPrices(items, prices, { threshold: preferences.lowMarginThreshold, buyingPriceList: preferences.buyingPriceList }, today),
    imageGroups: imagesReady ? findMissingImageGroups(items) : null,
    stockShortages: stock ? findStockShortages(items, stock.bins, stock.warehouses) : null,
    incompleteItems: findIncompleteCatalogItems(items),
  })
}
