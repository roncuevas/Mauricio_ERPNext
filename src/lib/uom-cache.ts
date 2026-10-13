import type { UomCatalogCache } from './types'
import { readCache, writeCache } from './indexed-db'

const config = { databaseName: 'mauricio-erpnext-uoms', storeName: 'uom-catalogs' }

export const readUomCatalog = (profileId: string) => readCache<UomCatalogCache>(config, profileId)

export const writeUomCatalog = (cache: UomCatalogCache) => writeCache(config, cache)
