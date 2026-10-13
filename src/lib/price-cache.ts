import type { ItemPriceCatalogCache } from './types'
import { readCache, writeCache } from './indexed-db'

const config = { databaseName: 'mauricio-erpnext-prices', storeName: 'item-price-catalogs' }

export const readItemPriceCatalog = (profileId: string) => readCache<ItemPriceCatalogCache>(config, profileId)

export const writeItemPriceCatalog = (cache: ItemPriceCatalogCache) => writeCache(config, cache)
