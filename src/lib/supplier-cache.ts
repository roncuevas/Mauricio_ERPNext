import type { SupplierCatalogCache } from './types'
import { createCacheStore } from './indexed-db'

const config = { databaseName: 'mauricio-erpnext-suppliers', storeName: 'supplier-catalogs' }
const store = createCacheStore<SupplierCatalogCache>(config)

export const readSupplierCatalog = store.read

export const writeSupplierCatalog = store.write
