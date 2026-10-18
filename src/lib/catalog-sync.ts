import { ErpNextError, type ErpNextClient } from './erpnext'
import { listAllDocuments } from './pagination'
import type { UomCatalogCache, VariantAttribute, VariantItem } from './types'

export type ItemSearchDetails = { barcodes: string[]; sku?: unknown; barcode?: unknown }
export type ItemUomRow = { parent: string; uom: string; conversion_factor: number }
export type ItemVariantAttributeRow = { parent: string; attribute: string; attribute_value?: string }

const UOM_PAGE_LENGTH = 500
export const UOM_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export async function syncUomCatalog(client: ErpNextClient, profileId: string, cached: UomCatalogCache | null, force = false) {
  if (!force && cached && Date.now() - Date.parse(cached.updatedAt) < UOM_CACHE_TTL_MS) return cached
  try {
    const uoms: string[] = []
    let start = 0
    while (true) {
      const batch = await client.listDocuments<{ name: string }>('UOM', { fields: ['name'], start, pageLength: UOM_PAGE_LENGTH, orderBy: 'name asc' })
      uoms.push(...batch.data.map((row) => row.name).filter(Boolean))
      if (batch.data.length < UOM_PAGE_LENGTH) break
      start += batch.data.length
    }
    return { profileId, updatedAt: new Date().toISOString(), uoms: Array.from(new Set(uoms)) }
  } catch (error) {
    if (cached) return cached
    throw error
  }
}

export async function readItemUomsThroughItems(client: ErpNextClient, items: VariantItem[], setMessage: (message: string) => void) {
  const rows: ItemUomRow[] = []
  const concurrency = 8
  for (let start = 0; start < items.length; start += concurrency) {
    const batch = items.slice(start, start + concurrency)
    setMessage(`Leyendo UOM desde Items: ${Math.min(start + batch.length, items.length)} de ${items.length}`)
    const documents = await Promise.all(batch.map((item) => client.getDocument<VariantItem>('Item', item.name)))
    for (const document of documents) for (const uom of document.uoms ?? []) rows.push({ parent: document.name, uom: uom.uom, conversion_factor: uom.conversion_factor })
  }
  return rows
}

export async function readItemSearchDetails(client: ErpNextClient, items: Array<{ name: string }>, setMessage: (message: string) => void) {
  const details: Record<string, ItemSearchDetails> = {}
  try {
    const rows = await listAllItemBarcodes(client)
    for (const row of rows) (details[row.parent] ??= { barcodes: [] }).barcodes.push(row.barcode)
    return details
  } catch (error) {
    if (!(error instanceof ErpNextError) || ![403, 404].includes(error.status)) throw error
  }
  const concurrency = 8
  for (let start = 0; start < items.length; start += concurrency) {
    const batch = items.slice(start, start + concurrency)
    setMessage(`Leyendo códigos desde Items: ${Math.min(start + batch.length, items.length)} de ${items.length}`)
    const documents = await Promise.all(batch.map((item) => client.getDocument<Record<string, unknown>>('Item', item.name)))
    for (const document of documents) {
      const barcodes = Array.isArray(document.barcodes) ? document.barcodes.map((row) => typeof row === 'object' && row ? String((row as Record<string, unknown>).barcode ?? '') : '').filter(Boolean) : []
      details[String(document.name)] = { barcodes, sku: document.sku, barcode: document.barcode }
    }
  }
  return details
}

export async function readItemVariantAttributes(client: ErpNextClient, items: Array<{ name: string }>, setMessage: (message: string) => void) {
  let rows: ItemVariantAttributeRow[] = []
  try {
    rows = await listAllDocuments<ItemVariantAttributeRow>(client, 'Item Variant Attribute', {
      fields: ['parent', 'attribute', 'attribute_value'],
      filters: [['parenttype', '=', 'Item']],
      orderBy: 'parent asc, idx asc',
    }, (count) => setMessage(`Descargando atributos de variantes: ${count}`))
  } catch (error) {
    if (!(error instanceof ErpNextError) || ![403, 404].includes(error.status)) throw error
    const concurrency = 8
    for (let start = 0; start < items.length; start += concurrency) {
      const batch = items.slice(start, start + concurrency)
      setMessage(`Leyendo atributos desde Items: ${Math.min(start + batch.length, items.length)} de ${items.length}`)
      const documents = await Promise.all(batch.map((item) => client.getDocument<Record<string, unknown>>('Item', item.name)))
      for (const document of documents) {
        const attributes = Array.isArray(document.attributes) ? document.attributes : []
        for (const row of attributes) {
          if (!row || typeof row !== 'object') continue
          const entry = row as Record<string, unknown>
          const attribute = String(entry.attribute ?? '')
          if (attribute) rows.push({ parent: String(document.name), attribute, attribute_value: String(entry.attribute_value ?? '') || undefined })
        }
      }
    }
  }

  const attributeNames = Array.from(new Set(rows.map((row) => row.attribute).filter(Boolean)))
  const options = new Map<string, string[]>()
  await Promise.all(attributeNames.map(async (attribute) => {
    try {
      const document = await client.getDocument<Record<string, unknown>>('Item Attribute', attribute)
      const values = Array.isArray(document.item_attribute_values) ? document.item_attribute_values : []
      const names = values.flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const entry = value as Record<string, unknown>
        const name = String(entry.attribute_value ?? entry.value ?? '')
        return name ? [name] : []
      })
      if (names.length) options.set(attribute, Array.from(new Set(names)))
    } catch {
      // Attribute options are useful enrichment; the variant rows remain valid without them.
    }
  }))

  const attributesByItem: Record<string, VariantAttribute[]> = {}
  for (const row of rows) {
    const current = attributesByItem[row.parent] ?? []
    current.push({ attribute: row.attribute, attribute_value: row.attribute_value, values: options.get(row.attribute) })
    attributesByItem[row.parent] = current
  }
  return attributesByItem
}

async function listAllItemBarcodes(client: ErpNextClient) {
  const rows: Array<{ parent: string; barcode: string }> = []
  let start = 0
  while (true) {
    const batch = await client.listDocuments<{ parent: string; barcode: string }>('Item Barcode', { fields: ['parent', 'barcode'], filters: [['parenttype', '=', 'Item'], ['parentfield', '=', 'barcodes']], start, pageLength: 500, orderBy: 'parent asc, idx asc' })
    rows.push(...batch.data)
    if (batch.data.length < 500) return rows
    start += batch.data.length
  }
}
