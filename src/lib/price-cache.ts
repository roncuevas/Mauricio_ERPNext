import type { ItemPrice, ItemPriceCatalogCache } from './types'
import { createCacheStore } from './indexed-db'

/** Where this cache lives, for measuring and clearing a profile's data. */
export const priceCacheLocation = { databaseName: 'mauricio-erpnext-prices', storeName: 'item-price-catalogs' }
const config = priceCacheLocation
const store = createCacheStore<ItemPriceCatalogCache>(config)

export const readItemPriceCatalog = store.read

export const writeItemPriceCatalog = store.write

export async function patchItemPriceCatalog(profileId: string, price: ItemPrice) {
  const cache = await readItemPriceCatalog(profileId)
  if (!cache) return null
  return writeItemPriceCatalog({ ...cache, locallyModified: true, prices: [...cache.prices.filter((candidate) => candidate.name !== price.name), price] })
}
