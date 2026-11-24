import type { DocTypeCatalogCache } from './types'
import { createCacheStore } from './indexed-db'

const databaseName = 'mauricio-erpnext-doctypes'
const storeName = 'doctype-catalogs'
/** Where this cache lives, for measuring and clearing a profile's data. */
export const doctypeCacheLocation = { databaseName, storeName }
const config = doctypeCacheLocation
const store = createCacheStore<DocTypeCatalogCache>(config)

export const readDocTypeCatalog = store.read

export const writeDocTypeCatalog = store.write
