export type CacheRecord = { profileId: string }

type StoreConfig = {
  databaseName: string
  storeName: string
  additionalStoreNames?: string[]
  version?: number
}

export type CacheStore<T extends CacheRecord> = {
  read: (profileId: string) => Promise<T | null>
  write: (cache: T) => Promise<T>
}

const databases = new Map<string, Promise<IDBDatabase>>()

function openDatabase({ databaseName, storeName, additionalStoreNames = [], version = 1 }: StoreConfig): Promise<IDBDatabase> {
  const key = `${databaseName}:${version}`
  const existing = databases.get(key)
  if (existing) return existing

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, version)
    request.onupgradeneeded = () => {
      const stores = [storeName, ...additionalStoreNames]
      for (const name of stores) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'profileId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la caché local.'))
  })
  databases.set(key, promise)
  return promise
}

export async function readCache<T extends CacheRecord>(config: StoreConfig, profileId: string): Promise<T | null> {
  if (!profileId.trim()) throw new Error('La caché requiere un perfil válido.')
  const database = await openDatabase(config)
  return new Promise((resolve, reject) => {
    const request = database.transaction(config.storeName, 'readonly').objectStore(config.storeName).get(profileId)
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer la caché local.'))
  })
}

export async function writeCache<T extends CacheRecord>(config: StoreConfig, cache: T): Promise<T> {
  if (!cache.profileId.trim()) throw new Error('La caché requiere un perfil válido.')
  const database = await openDatabase(config)
  return new Promise((resolve, reject) => {
    const request = database.transaction(config.storeName, 'readwrite').objectStore(config.storeName).put(cache)
    request.onsuccess = () => resolve(cache)
    request.onerror = () => reject(request.error ?? new Error('No se pudo guardar la caché local.'))
  })
}

export function createCacheStore<T extends CacheRecord>(config: StoreConfig): CacheStore<T> {
  return {
    read: (profileId) => readCache<T>(config, profileId),
    write: (cache) => writeCache<T>(config, cache),
  }
}
