import type { ItemCatalogCache } from './types'
import { readCache, writeCache } from './indexed-db'
import { searchScore } from './search'

const databaseName = 'mauricio-erpnext'
const storeName = 'item-catalogs'
const config = { databaseName, storeName }

export const readItemCatalog = (profileId: string) => readCache<ItemCatalogCache>(config, profileId)

export const writeItemCatalog = (cache: ItemCatalogCache) => writeCache(config, cache)

export async function patchItemCatalog(profileId: string, item: ItemCatalogCache['items'][number]) {
  const cache = await readItemCatalog(profileId)
  if (!cache) return null
  return writeItemCatalog({ ...cache, locallyModified: true, items: [...cache.items.filter((candidate) => candidate.name !== item.name), item] })
}

export function filterItems(items: ItemCatalogCache['items'], search: string) {
  return rankItems(items, search).map((entry) => entry.item)
}

export function rankItems(items: ItemCatalogCache['items'], search: string) {
  return items.map((item, index) => ({ item, index, match: searchScore(search, [
    { value: item.item_name, weight: 5 },
    { value: item.name, weight: 5 },
    { value: item.item_code, weight: 5 },
    { value: item.brand, weight: 3 },
    { value: item.item_group, weight: 2 },
    { value: item.barcodes, weight: 4 },
    { value: item.stock_uom, weight: 1 },
  ]) })).filter((entry) => entry.match).sort((left, right) => (right.match?.score ?? 0) - (left.match?.score ?? 0) || left.index - right.index)
}
