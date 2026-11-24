import type { ItemCatalogCache } from './types'
import { createCacheStore } from './indexed-db'
import { productSearchScore } from './search'

const databaseName = 'mauricio-erpnext'
const storeName = 'item-catalogs'
const config = { databaseName, storeName }
const store = createCacheStore<ItemCatalogCache>(config)

export const readItemCatalog = store.read

export const writeItemCatalog = store.write

export async function patchItemCatalog(profileId: string, updates: ItemCatalogCache['items'][number] | ItemCatalogCache['items']) {
  const cache = await readItemCatalog(profileId)
  if (!cache) return null
  const list = Array.isArray(updates) ? updates : [updates]
  const names = new Set(list.map((item) => item.name))
  return writeItemCatalog({ ...cache, locallyModified: true, items: [...cache.items.filter((candidate) => !names.has(candidate.name)), ...list] })
}

export function filterItems(items: ItemCatalogCache['items'], search: string) {
  return rankItems(items, search).map((entry) => entry.item)
}

export function rankItems(items: ItemCatalogCache['items'], search: string) {
  return items.map((item, index) => ({ item, index, match: productSearchScore(item, search) })).filter((entry) => entry.match).sort((left, right) => (right.match?.score ?? 0) - (left.match?.score ?? 0) || left.index - right.index)
}
