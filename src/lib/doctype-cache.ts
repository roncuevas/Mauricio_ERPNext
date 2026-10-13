import type { DocTypeCatalogCache } from './types'

const databaseName = 'mauricio-erpnext-doctypes'
const storeName = 'doctype-catalogs'
const databaseVersion = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'profileId' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la caché local.'))
  })
}

export async function readDocTypeCatalog(profileId: string): Promise<DocTypeCatalogCache | null> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(profileId)
    request.onsuccess = () => resolve((request.result as DocTypeCatalogCache | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer la caché local.'))
  })
}

export async function writeDocTypeCatalog(cache: DocTypeCatalogCache): Promise<DocTypeCatalogCache> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(cache)
    request.onsuccess = () => resolve(cache)
    request.onerror = () => reject(request.error ?? new Error('No se pudo guardar la caché local.'))
  })
}
