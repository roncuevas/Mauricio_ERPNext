import type { UomCatalogCache } from './types'
import { createCacheStore } from './indexed-db'

const config = { databaseName: 'mauricio-erpnext-uoms', storeName: 'uom-catalogs' }
const store = createCacheStore<UomCatalogCache>(config)

export const readUomCatalog = store.read

export const writeUomCatalog = store.write
