import type { ItemUom, VariantCatalogCache, VariantItem } from './types'
import { createCacheStore } from './indexed-db'
import { readItemCatalog } from './item-cache'

const databaseName = 'mauricio-erpnext-variants'
const storeName = 'variant-catalogs'
const config = { databaseName, storeName }
const store = createCacheStore<VariantCatalogCache>(config)

export const readVariantCatalog = store.read

export async function readVariantCatalogOrItems(profileId: string) {
  const cached = await store.read(profileId)
  if (cached?.items.length) return cached
  const itemCache = await readItemCatalog(profileId)
  if (!itemCache) return cached
  return { profileId, updatedAt: itemCache.updatedAt, items: itemCache.items as VariantItem[] } satisfies VariantCatalogCache
}

export const writeVariantCatalog = store.write

export async function patchVariantCatalog(profileId: string, item: VariantItem) {
  const cache = await readVariantCatalog(profileId)
  if (!cache) return null
  return writeVariantCatalog({ ...cache, locallyModified: true, items: [...cache.items.filter((candidate) => candidate.name !== item.name), item] })
}

export function mergeItemUoms(items: VariantItem[], rows: Array<{ parent: string; uom: string; conversion_factor: number }>) {
  const rowsByItem = new Map<string, ItemUom[]>()
  for (const row of rows) {
    const current = rowsByItem.get(row.parent) ?? []
    current.push({ uom: row.uom, conversion_factor: Number(row.conversion_factor) })
    rowsByItem.set(row.parent, current)
  }
  return items.map((item) => {
    const uoms = [{ uom: item.stock_uom ?? '', conversion_factor: 1 }, ...(rowsByItem.get(item.name) ?? [])]
      .filter((uom) => uom.uom)
      .filter((uom, index, all) => all.findIndex((candidate) => candidate.uom === uom.uom) === index)
    return { ...item, uoms }
  })
}

export function hasMultipleUoms(item: VariantItem) {
  return (item.uoms?.length ?? 0) > 1
}

export type VariantAttributeCoverage = { attribute: string; expected: string[]; created: string[]; missing: string[] }

export function getVariantAttributeCoverage(template: VariantItem, variants: VariantItem[]): VariantAttributeCoverage[] {
  const templateAttributes = template.attributes ?? []
  const attributeNames = Array.from(new Set(templateAttributes.map((attribute) => attribute.attribute).filter(Boolean)))
  return attributeNames.map((attribute) => {
    const definition = templateAttributes.find((candidate) => candidate.attribute === attribute)
    const created = Array.from(new Set(variants.flatMap((variant) => (variant.attributes ?? []).filter((candidate) => candidate.attribute === attribute).map((candidate) => candidate.attribute_value ?? '').filter(Boolean))))
    const expected = Array.from(new Set(definition?.values?.filter(Boolean) ?? created))
    return { attribute, expected, created, missing: expected.filter((value) => !created.includes(value)) }
  })
}

export function buildVariantTree(items: VariantItem[]) {
  const children = new Map<string, VariantItem[]>()
  const itemNames = new Set(items.map((item) => item.name))
  for (const item of items) {
    if (!item.variant_of) continue
    const group = children.get(item.variant_of) ?? []
    group.push(item)
    children.set(item.variant_of, group)
  }
  const roots = items.filter((item) => !item.variant_of || !itemNames.has(item.variant_of))
  return { roots, children }
}

export type VariantHierarchyEntry = {
  item: VariantItem
  depth: number
  role: 'plantilla' | 'variante' | 'item'
  parent?: string
}

export function flattenVariantHierarchy(items: VariantItem[], includeTemplates = true): VariantHierarchyEntry[] {
  const tree = buildVariantTree(items)
  const entries: VariantHierarchyEntry[] = []
  const visited = new Set<string>()
  const visit = (item: VariantItem, depth: number, parent?: string) => {
    if (visited.has(item.name)) return
    visited.add(item.name)
    const children = tree.children.get(item.name) ?? []
    const isTemplate = Boolean(item.has_variants) || children.length > 0
    if (includeTemplates || !isTemplate) entries.push({ item, depth, role: isTemplate ? 'plantilla' : depth > 0 ? 'variante' : 'item', parent })
    children.sort((left, right) => (left.item_name || left.name).localeCompare(right.item_name || right.name, 'es')).forEach((child) => visit(child, depth + 1, item.name))
  }
  const roots = [...tree.roots].sort((left, right) => (left.item_name || left.name).localeCompare(right.item_name || right.name, 'es'))
  roots.forEach((root) => visit(root, 0))
  items.filter((item) => !visited.has(item.name)).forEach((item) => visit(item, 0))
  return entries
}
