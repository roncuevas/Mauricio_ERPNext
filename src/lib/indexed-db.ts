export type CacheRecord = { profileId: string }

type StoreConfig = {
  databaseName: string
  storeName: string
  version?: number
}

const databases = new Map<string, Promise<IDBDatabase>>()

function openDatabase({ databaseName, storeName, version = 1 }: StoreConfig): Promise<IDBDatabase> {
  const key = `${databaseName}:${version}`
  const existing = databases.get(key)
  if (existing) return existing

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, version)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'profileId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la caché local.'))
  })
  databases.set(key, promise)
  return promise
}

export async function readCache<T extends CacheRecord>(config: StoreConfig, profileId: string): Promise<T | null> {
  const database = await openDatabase(config)
  return new Promise((resolve, reject) => {
    const request = database.transaction(config.storeName, 'readonly').objectStore(config.storeName).get(profileId)
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer la caché local.'))
  })
}

export async function writeCache<T extends CacheRecord>(config: StoreConfig, cache: T): Promise<T> {
  const database = await openDatabase(config)
  return new Promise((resolve, reject) => {
    const request = database.transaction(config.storeName, 'readwrite').objectStore(config.storeName).put(cache)
    request.onsuccess = () => resolve(cache)
    request.onerror = () => reject(request.error ?? new Error('No se pudo guardar la caché local.'))
  })
}
