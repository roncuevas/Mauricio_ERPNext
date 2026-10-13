import type { ItemCatalogCache } from './types'
import { readCache, writeCache } from './indexed-db'
import { fuzzyMatch } from './search'

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
  return items.filter((item) => fuzzyMatch(search, [item]))
}
