import type { SupplierCatalogCache } from './types'
import { createCacheStore } from './indexed-db'

/** Where this cache lives, for measuring and clearing a profile's data. */
export const supplierCacheLocation = { databaseName: 'mauricio-erpnext-suppliers', storeName: 'supplier-catalogs' }
const config = supplierCacheLocation
const store = createCacheStore<SupplierCatalogCache>(config)

export const readSupplierCatalog = store.read

export const writeSupplierCatalog = store.write
