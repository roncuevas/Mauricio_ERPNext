import type { SupplierCatalogCache } from './types'
import { readCache, writeCache } from './indexed-db'

const config = { databaseName: 'mauricio-erpnext-suppliers', storeName: 'supplier-catalogs' }

export const readSupplierCatalog = (profileId: string) => readCache<SupplierCatalogCache>(config, profileId)

export const writeSupplierCatalog = (cache: SupplierCatalogCache) => writeCache(config, cache)
