import type { DocTypeCatalogCache } from './types'
import { createCacheStore } from './indexed-db'

const databaseName = 'mauricio-erpnext-doctypes'
const storeName = 'doctype-catalogs'
const config = { databaseName, storeName }
const store = createCacheStore<DocTypeCatalogCache>(config)

export const readDocTypeCatalog = store.read

export const writeDocTypeCatalog = store.write
