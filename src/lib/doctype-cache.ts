import type { DocTypeCatalogCache } from './types'
import { readCache, writeCache } from './indexed-db'

const databaseName = 'mauricio-erpnext-doctypes'
const storeName = 'doctype-catalogs'
const config = { databaseName, storeName }

export const readDocTypeCatalog = (profileId: string) => readCache<DocTypeCatalogCache>(config, profileId)

export const writeDocTypeCatalog = (cache: DocTypeCatalogCache) => writeCache(config, cache)
