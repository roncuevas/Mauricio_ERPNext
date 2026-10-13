import type { ItemPrice, ItemPriceCatalogCache } from './types'
import { readCache, writeCache } from './indexed-db'

const config = { databaseName: 'mauricio-erpnext-prices', storeName: 'item-price-catalogs' }

export const readItemPriceCatalog = (profileId: string) => readCache<ItemPriceCatalogCache>(config, profileId)

export const writeItemPriceCatalog = (cache: ItemPriceCatalogCache) => writeCache(config, cache)

export async function patchItemPriceCatalog(profileId: string, price: ItemPrice) {
  const cache = await readItemPriceCatalog(profileId)
  if (!cache) return null
  return writeItemPriceCatalog({ ...cache, locallyModified: true, prices: [...cache.prices.filter((candidate) => candidate.name !== price.name), price] })
}
