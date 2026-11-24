type ProductImageRecord = { id: string; profileId: string; itemName: string; url: string; blob: Blob; updatedAt: string }
/**
 * What IndexedDB holds: the bytes as an ArrayBuffer, because Safari/WebKit refuses to store Blobs in some contexts.
 * Records written before carry `blob` instead.
 */
type StoredImageRecord = Omit<ProductImageRecord, 'blob'> & { bytes?: ArrayBuffer; type?: string; blob?: Blob }

function fromStored(record: StoredImageRecord): ProductImageRecord {
  const { bytes, type, blob, ...rest } = record
  return { ...rest, blob: blob ?? new Blob(bytes ? [bytes] : [], { type: type ?? '' }) }
}

const databaseName = 'mauricio-erpnext-product-images'
const storeName = 'images'
/** Where downloaded product images live, one record per profile and item, indexed by `profileId`. */
export const productImageLocation = { databaseName, storeName }
let databasePromise: Promise<IDBDatabase> | null = null

function openDatabase() {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(storeName, { keyPath: 'id' })
      store.createIndex('profileId', 'profileId')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { databasePromise = null; reject(request.error ?? new Error('No se pudo abrir la caché de imágenes.')) }
  })
  return databasePromise
}

function imageId(profileId: string, itemName: string) { return `${profileId}\u0000${itemName}` }

function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason: unknown) => void) => void) {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    action(transaction.objectStore(storeName), resolve, reject)
    transaction.onerror = () => reject(transaction.error ?? new Error('No se pudo actualizar la caché de imágenes.'))
  }))
}

export function readProductImage(profileId: string, itemName: string) {
  if (!profileId.trim() || !itemName.trim()) return Promise.resolve(null)
  return transact<ProductImageRecord | null>('readonly', (store, resolve, reject) => {
    const request = store.get(imageId(profileId, itemName))
    request.onsuccess = () => { const stored = request.result as StoredImageRecord | undefined; resolve(stored ? fromStored(stored) : null) }
    request.onerror = () => reject(request.error)
  })
}

export async function writeProductImage(record: Omit<ProductImageRecord, 'id' | 'updatedAt'>) {
  if (!record.profileId.trim() || !record.itemName.trim() || !record.url.trim() || !record.blob.size) throw new Error('La imagen requiere perfil, producto, URL y contenido.')
  const { blob, ...rest } = record
  const value: StoredImageRecord = { ...rest, bytes: await blob.arrayBuffer(), type: blob.type, id: imageId(record.profileId, record.itemName), updatedAt: new Date().toISOString() }
  return transact<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(value)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export function listProductImages(profileId: string) {
  if (!profileId.trim()) return Promise.resolve([] as ProductImageRecord[])
  return transact<ProductImageRecord[]>('readonly', (store, resolve, reject) => {
    const request = store.index('profileId').getAll(profileId)
    request.onsuccess = () => resolve((request.result as StoredImageRecord[]).map(fromStored))
    request.onerror = () => reject(request.error)
  })
}
