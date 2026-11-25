import type { CachedItem, ItemPrice, VariantItem } from './types'

export type ProductKind = 'template' | 'variant' | 'single'
export type ProductFilters = { group: string; brand: string; status: '' | 'active' | 'disabled'; type: '' | ProductKind; noSalePrice: boolean }
export const emptyProductFilters: ProductFilters = { group: '', brand: '', status: '', type: '', noSalePrice: false }

const statuses = ['active', 'disabled'] as const
const kinds = ['template', 'variant', 'single'] as const

/** Filters live in the URL next to the search, so returning from an item keeps them. Unknown values are ignored. */
export function readProductFilters(params: URLSearchParams): ProductFilters {
  const status = params.get('status')
  const type = params.get('type')
  return {
    group: params.get('group') ?? '',
    brand: params.get('brand') ?? '',
    status: statuses.find((value) => value === status) ?? '',
    type: kinds.find((value) => value === type) ?? '',
    noSalePrice: params.get('noSalePrice') === '1',
  }
}

export function writeProductFilters(params: URLSearchParams, filters: ProductFilters) {
  for (const key of ['group', 'brand', 'status', 'type'] as const) {
    if (filters[key]) params.set(key, filters[key]); else params.delete(key)
  }
  if (filters.noSalePrice) params.set('noSalePrice', '1'); else params.delete('noSalePrice')
}

export function countProductFilters(filters: ProductFilters) {
  return [filters.group, filters.brand, filters.status, filters.type, filters.noSalePrice].filter(Boolean).length
}

/**
 * Template and variant relationships. The Items catalog may lack `variant_of`/`has_variants`, so the variants
 * catalog is the source when it has the item.
 */
export function productFamilyIndex(variants: VariantItem[]) {
  const byName = new Map(variants.map((item) => [item.name, item]))
  const parentOf = (item: CachedItem) => byName.get(String(item.name))?.variant_of || item.variant_of || ''
  const kindOf = (item: CachedItem): ProductKind => byName.get(String(item.name))?.has_variants || item.has_variants ? 'template' : parentOf(item) ? 'variant' : 'single'
  return { parentOf, kindOf }
}
export type ProductFamilyIndex = ReturnType<typeof productFamilyIndex>

/** Item codes with at least one selling price, matched by name or item code like the price cells. */
export function salePriceCodes(prices: ItemPrice[]) {
  return new Set(prices.filter((price) => price.selling && price.item_code).map((price) => String(price.item_code)))
}

export function filterProducts(items: CachedItem[], filters: ProductFilters, index: ProductFamilyIndex, withSalePrice: Set<string>) {
  return items.filter((item) =>
    (!filters.group || item.item_group === filters.group)
    && (!filters.brand || item.brand === filters.brand)
    && (!filters.status || (filters.status === 'disabled') === Boolean(item.disabled))
    && (!filters.type || index.kindOf(item) === filters.type)
    && (!filters.noSalePrice || !(withSalePrice.has(String(item.name)) || withSalePrice.has(String(item.item_code ?? '')))))
}

export type ProductFamily = {
  item: CachedItem
  /** The family's variants that passed the search and filters, in result order. */
  children: CachedItem[]
  /** Every variant of a template in the catalog, whatever the search shows. */
  variantCount: number
  /** False when the template is only shown as the parent of matching variants. */
  matched: boolean
}

/**
 * Folds a flat, ranked result list into families: each variant goes under its template, which is placed where its
 * first matching member ranked, even when only its variants matched. A variant whose template is not in the catalog
 * stays on its own.
 */
export function groupProductFamilies(catalog: CachedItem[], visible: CachedItem[], index: ProductFamilyIndex): ProductFamily[] {
  const byName = new Map(catalog.map((item) => [String(item.name), item]))
  const variantCounts = new Map<string, number>()
  for (const item of catalog) {
    const parent = index.parentOf(item)
    if (parent) variantCounts.set(parent, (variantCounts.get(parent) ?? 0) + 1)
  }
  const families = new Map<string, ProductFamily>()
  const entry = (item: CachedItem, matched: boolean) => {
    const name = String(item.name)
    const existing = families.get(name)
    if (existing) { existing.matched ||= matched; return existing }
    const family: ProductFamily = { item, children: [], variantCount: variantCounts.get(name) ?? 0, matched }
    families.set(name, family)
    return family
  }
  for (const item of visible) {
    const template = byName.get(index.parentOf(item))
    if (template && template !== item) entry(template, false).children.push(item)
    else entry(item, true)
  }
  return [...families.values()]
}
