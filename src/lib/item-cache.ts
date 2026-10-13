import type { ItemCatalogCache } from './types'

const databaseName = 'mauricio-erpnext'
const storeName = 'item-catalogs'
const databaseVersion = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'profileId' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la caché local.'))
  })
}

export async function readItemCatalog(profileId: string): Promise<ItemCatalogCache | null> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(profileId)
    request.onsuccess = () => resolve((request.result as ItemCatalogCache | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer la caché local.'))
  })
}

export async function writeItemCatalog(cache: ItemCatalogCache): Promise<ItemCatalogCache> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(cache)
    request.onsuccess = () => resolve(cache)
    request.onerror = () => reject(request.error ?? new Error('No se pudo guardar la caché local.'))
  })
}

export function filterItems(items: ItemCatalogCache['items'], search: string) {
  const normalized = search.trim().toLocaleLowerCase()
  if (!normalized) return items
  return items.filter((item) => `${item.name} ${item.item_name ?? ''}`.toLocaleLowerCase().includes(normalized))
}
