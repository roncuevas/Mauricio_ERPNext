import { managedSnapshotDatabase, managedSnapshotLocations, metadataKey, type ManagedCacheId } from './cache-manager'
import { doctypeCacheLocation } from './doctype-cache'
import { itemCacheLocation } from './item-cache'
import { posCartsLocation } from './pos-local-carts'
import { priceCacheLocation } from './price-cache'
import { productImageLocation } from './product-image-cache'
import { customerCacheLocation, salesOrderCacheLocation } from './sales-order-cache'
import { stockCacheLocation } from './stock-cache'
import { supplierCacheLocation } from './supplier-cache'
import { uomCacheLocation } from './uom-cache'
import { variantCacheLocation } from './variant-cache'

type Location = { databaseName: string; storeName: string }

/** Every downloaded ERPNext cache, one record per profile keyed by `profileId`. */
const cacheLocations: Record<ManagedCacheId, Location> = {
  products: itemCacheLocation,
  variants: variantCacheLocation,
  uom: uomCacheLocation,
  prices: priceCacheLocation,
  priceLists: { databaseName: managedSnapshotDatabase, storeName: managedSnapshotLocations.priceLists },
  stock: stockCacheLocation,
  suppliers: supplierCacheLocation,
  customers: customerCacheLocation,
  doctypes: doctypeCacheLocation,
  posContext: { databaseName: managedSnapshotDatabase, storeName: managedSnapshotLocations.posContext },
  shifts: { databaseName: managedSnapshotDatabase, storeName: managedSnapshotLocations.shifts },
  salesOrders: salesOrderCacheLocation,
  quotations: { databaseName: managedSnapshotDatabase, storeName: managedSnapshotLocations.quotations },
}

const localStoragePrefix = 'mauricio-erpnext:'

export type ProfileDataUsage = {
  profileId: string
  /** Bytes of each downloaded ERPNext cache; only caches that hold data are listed. */
  caches: { id: ManagedCacheId; bytes: number }[]
  images: { count: number; bytes: number }
  /** Saved POS carts: work in progress that clearing the cache keeps. */
  carts: number
  /** Preferences and pending POS work kept in localStorage for this profile. */
  preferences: number
  /** What "clear cache" frees: the caches plus the images. */
  cacheBytes: number
  total: number
}

/** UTF-8 size of a stored value, plus the bytes of any Blob it carries. Structured clone overhead is ignored. */
function recordBytes(value: unknown): number {
  if (value instanceof Blob) return value.size
  if (!value || typeof value !== 'object') return new Blob([JSON.stringify(value) ?? '']).size
  let blobs = 0
  const json = JSON.stringify(value, (_key, entry) => {
    if (entry instanceof Blob) { blobs += entry.size; return undefined }
    return entry
  })
  return new Blob([json]).size + blobs
}

/**
 * Opens a database only when it already exists, so measuring never creates empty databases. Its connection closes
 * itself when the app needs to upgrade the same database.
 */
function openExisting(databaseName: string): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let created = false
    const request = indexedDB.open(databaseName)
    request.onupgradeneeded = () => { created = true; request.transaction?.abort() }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = (event) => {
      if (created) { event.preventDefault(); resolve(null); return }
      reject(request.error ?? new Error('No se pudo abrir la caché local.'))
    }
  })
}

async function withStore<T>(location: Location, mode: IDBTransactionMode, empty: T, action: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const database = await openExisting(location.databaseName)
  if (!database) return empty
  try {
    if (!database.objectStoreNames.contains(location.storeName)) return empty
    return await action(database.transaction(location.storeName, mode).objectStore(location.storeName))
  } finally {
    database.close()
  }
}

function settle<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer la caché local.'))
  })
}

/** Walks a cursor, calling `visit` for each entry, and resolves when it ends. */
function walk(request: IDBRequest<IDBCursorWithValue | null>, visit: (cursor: IDBCursorWithValue) => void) {
  return new Promise<void>((resolve, reject) => {
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) { resolve(); return }
      visit(cursor)
      cursor.continue()
    }
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer la caché local.'))
  })
}

const cartRange = (profileId: string) => IDBKeyRange.bound(`${profileId}::`, `${profileId}::￿`)

/** localStorage keys that belong to one profile: they end in `:<profileId>` or carry it as a middle segment. */
function profileStorageKeys(profileId: string) {
  const keys: string[] = []
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key?.startsWith(localStoragePrefix) && (key.endsWith(`:${profileId}`) || key.includes(`:${profileId}:`))) keys.push(key)
    }
  } catch { /* Storage can be unavailable; nothing to report then. */ }
  return keys
}

export async function measureProfileData(profileId: string): Promise<ProfileDataUsage> {
  const caches = (await Promise.all((Object.entries(cacheLocations) as [ManagedCacheId, Location][]).map(async ([id, location]) => ({
    id,
    bytes: await withStore(location, 'readonly', 0, async (store) => {
      const record = await settle(store.get(profileId))
      return record === undefined ? 0 : recordBytes(record)
    }),
  })))).filter((entry) => entry.bytes > 0)
  const images = await withStore(productImageLocation, 'readonly', { count: 0, bytes: 0 }, async (store) => {
    const result = { count: 0, bytes: 0 }
    await walk(store.index('profileId').openCursor(profileId), (cursor) => { result.count += 1; result.bytes += recordBytes(cursor.value) })
    return result
  })
  const carts = await withStore(posCartsLocation, 'readonly', 0, async (store) => {
    let bytes = 0
    await walk(store.openCursor(cartRange(profileId)), (cursor) => { bytes += recordBytes(cursor.value) })
    return bytes
  })
  const syncMetadata = metadataKey(profileId)
  let preferences = 0
  let metadata = 0
  for (const key of profileStorageKeys(profileId)) {
    // localStorage keeps UTF-16 strings: two bytes per character.
    const bytes = (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2
    if (key === syncMetadata) metadata += bytes
    else preferences += bytes
  }
  const cacheBytes = caches.reduce((sum, entry) => sum + entry.bytes, 0) + images.bytes + metadata
  return { profileId, caches, images, carts, preferences, cacheBytes, total: cacheBytes + carts + preferences }
}

/**
 * Deletes a profile's downloaded data from this browser. By default it clears the ERPNext caches, the product images
 * and the sync history, and keeps saved POS carts and preferences, which hold the user's own work and choices.
 * `everything` also removes those, for a profile that is being deleted.
 */
export async function clearProfileData(profileId: string, { everything = false }: { everything?: boolean } = {}) {
  if (!profileId.trim()) throw new Error('La caché requiere un perfil válido.')
  await Promise.all(Object.values(cacheLocations).map((location) => withStore(location, 'readwrite', undefined, async (store) => { await settle(store.delete(profileId)) })))
  await withStore(productImageLocation, 'readwrite', undefined, (store) => walk(store.index('profileId').openCursor(profileId), (cursor) => { cursor.delete() }))
  if (everything) await withStore(posCartsLocation, 'readwrite', undefined, async (store) => { await settle(store.delete(cartRange(profileId))) })
  const syncMetadata = metadataKey(profileId)
  try {
    for (const key of profileStorageKeys(profileId)) if (everything || key === syncMetadata) localStorage.removeItem(key)
  } catch { /* Storage can be unavailable; the IndexedDB data is already gone. */ }
}

/** Profile ids that still have data in this browser, including profiles deleted before their data was cleared. */
export async function listProfilesWithData(): Promise<string[]> {
  const ids = new Set<string>()
  await Promise.all(Object.values(cacheLocations).map((location) => withStore(location, 'readonly', undefined, async (store) => {
    for (const key of await settle(store.getAllKeys())) if (typeof key === 'string') ids.add(key)
  })))
  await withStore(productImageLocation, 'readonly', undefined, async (store) => {
    const request = store.index('profileId').openKeyCursor(null, 'nextunique')
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => { const cursor = request.result; if (!cursor) { resolve(); return } if (typeof cursor.key === 'string') ids.add(cursor.key); cursor.continue() }
      request.onerror = () => reject(request.error)
    })
  })
  await withStore(posCartsLocation, 'readonly', undefined, async (store) => {
    for (const key of await settle(store.getAllKeys())) if (typeof key === 'string' && key.includes('::')) ids.add(key.slice(0, key.indexOf('::')))
  })
  return [...ids]
}
