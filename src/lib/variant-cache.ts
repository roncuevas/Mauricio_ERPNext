import type { ItemUom, VariantCatalogCache, VariantItem } from './types'
import { readCache, writeCache } from './indexed-db'

const databaseName = 'mauricio-erpnext-variants'
const storeName = 'variant-catalogs'
const config = { databaseName, storeName }

export const readVariantCatalog = (profileId: string) => readCache<VariantCatalogCache>(config, profileId)

export const writeVariantCatalog = (cache: VariantCatalogCache) => writeCache(config, cache)

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

export function buildVariantTree(items: VariantItem[]) {
  const children = new Map<string, VariantItem[]>()
  for (const item of items) {
    if (!item.variant_of) continue
    const group = children.get(item.variant_of) ?? []
    group.push(item)
    children.set(item.variant_of, group)
  }
  const roots = items.filter((item) => !item.variant_of || !items.some((candidate) => candidate.name === item.variant_of))
  return { roots, children }
}
