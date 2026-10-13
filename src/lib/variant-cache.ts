import type { ItemUom, VariantCatalogCache, VariantItem } from './types'

const databaseName = 'mauricio-erpnext-variants'
const storeName = 'variant-catalogs'
const databaseVersion = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'profileId' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la caché local.'))
  })
}

export async function readVariantCatalog(profileId: string): Promise<VariantCatalogCache | null> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(profileId)
    request.onsuccess = () => resolve((request.result as VariantCatalogCache | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer la caché local.'))
  })
}

export async function writeVariantCatalog(cache: VariantCatalogCache): Promise<VariantCatalogCache> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(cache)
    request.onsuccess = () => resolve(cache)
    request.onerror = () => reject(request.error ?? new Error('No se pudo guardar la caché local.'))
  })
}

export function mergeItemUoms(items: VariantItem[], rows: Array<{ parent: string; uom: string; conversion_factor: number }>) {
  const rowsByItem = new Map<string, ItemUom[]>()
  for (const row of rows) {
    const current = rowsByItem.get(row.parent) ?? []
    current.push({ uom: row.uom, conversion_factor: Number(row.conversion_factor) })
    rowsByItem.set(row.parent, current)
  }
  return items.map((item) => {
    const uoms = [{ uom: item.stock_uom ?? '', conversion_factor: 1 }, ...(rowsByItem.get(item.name) ?? [])]
      .filter((uom) => uom.uom)
      .filter((uom, index, all) => all.findIndex((candidate) => candidate.uom === uom.uom) === index)
    return { ...item, uoms }
  })
}

export function hasMultipleUoms(item: VariantItem) {
  return (item.uoms?.length ?? 0) > 1
}

export function buildVariantTree(items: VariantItem[]) {
  const children = new Map<string, VariantItem[]>()
  for (const item of items) {
    if (!item.variant_of) continue
    const group = children.get(item.variant_of) ?? []
    group.push(item)
    children.set(item.variant_of, group)
  }
  const roots = items.filter((item) => !item.variant_of || !items.some((candidate) => candidate.name === item.variant_of))
  return { roots, children }
}
