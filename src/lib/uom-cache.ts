import type { UomCatalogCache } from './types'
import { createCacheStore } from './indexed-db'

/** Where this cache lives, for measuring and clearing a profile's data. */
export const uomCacheLocation = { databaseName: 'mauricio-erpnext-uoms', storeName: 'uom-catalogs' }
const config = uomCacheLocation
const store = createCacheStore<UomCatalogCache>(config)

export const readUomCatalog = store.read

export const writeUomCatalog = store.write
